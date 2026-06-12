#include <catch2/catch_all.hpp>

#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <optional>
#include <string>

#include "app/host_plugin_runtime_client.hpp"
#include "app/host_plugin_runtime_family.hpp"
#include "app/host_plugin_runtime_service.hpp"
#include "app/host_plugin_session_broker.hpp"
#include "common/host_plugin_runtime_defaults.hpp"
#include "common/runtime_paths.hpp"

using namespace corridorkey;
using namespace corridorkey::app;

namespace {

#ifdef _WIN32
class ScopedEnvironmentVariable {
public:
    ScopedEnvironmentVariable(const char* name, std::optional<std::string> value)
        : m_name(name) {
        m_previous = common::environment_variable_copy(m_name.c_str());
        if (value.has_value()) {
            _putenv_s(m_name.c_str(), value->c_str());
        } else {
            _putenv_s(m_name.c_str(), "");
        }
    }

    ScopedEnvironmentVariable(const ScopedEnvironmentVariable&) = delete;
    ScopedEnvironmentVariable& operator=(const ScopedEnvironmentVariable&) = delete;

    ~ScopedEnvironmentVariable() {
        if (m_previous.has_value()) {
            _putenv_s(m_name.c_str(), m_previous->c_str());
        } else {
            _putenv_s(m_name.c_str(), "");
        }
    }

private:
    std::string m_name;
    std::optional<std::string> m_previous;
};
#endif

}  // namespace

//
// Test-file tidy-suppression rationale.
//
// Test fixtures legitimately use single-letter loop locals, magic
// numbers (resolution rungs, pixel coordinates, expected error counts),
// std::vector::operator[] on indices the test itself just constructed,
// and Catch2 / aggregate-init styles that pre-date the project's
// tightened .clang-tidy ruleset. The test source is verified
// behaviourally by ctest; converting every site to bounds-checked /
// designated-init / ranges form would obscure intent without changing
// what the tests prove. The same suppressions are documented and
// applied on the src/ tree where the underlying APIs live.
//
// NOLINTBEGIN(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)

TEST_CASE("host plugin runtime timeout defaults stay aligned across client and service",
          "[unit][ofx][runtime][regression]") {
    HostPluginRuntimeClientOptions client_options;
    HostPluginRuntimeServiceOptions service_options;
    HostPluginSessionBrokerOptions broker_options;

    REQUIRE(common::kDefaultHostPluginRenderTimeoutSeconds == 60);
    REQUIRE(common::kDefaultHostPluginPrepareTimeoutSeconds == 300);
    REQUIRE(common::kDefaultHostPluginRequestTimeoutMs == 60000);
    REQUIRE(common::kDefaultHostPluginPrepareTimeoutMs == 300000);
    REQUIRE(common::kDefaultHostPluginIdleTimeoutMs == 300000);

    REQUIRE(client_options.request_timeout_ms == common::kDefaultHostPluginRequestTimeoutMs);
    REQUIRE(client_options.prepare_timeout_ms == common::kDefaultHostPluginPrepareTimeoutMs);
    REQUIRE(client_options.idle_timeout_ms == common::kDefaultHostPluginIdleTimeoutMs);
    REQUIRE(service_options.idle_timeout == common::kDefaultHostPluginIdleTimeout);
    REQUIRE(broker_options.idle_session_ttl == common::kDefaultHostPluginIdleTimeout);
}

TEST_CASE("windows host plugin runtime server resolves to the dedicated GUI binary",
          "[unit][ofx][runtime][regression]") {
#if !defined(_WIN32)
    SUCCEED("The Windows host plugin runtime server binary naming is only applicable on Windows.");
#else
    const auto plugin_path = std::filesystem::path(
        "C:\\bundle\\CorridorKey.ofx.bundle\\Contents\\Win64\\CorridorKey.ofx");
    const auto runtime_server = resolve_host_plugin_runtime_server_binary(plugin_path);

    REQUIRE(runtime_server.filename() == "corridorkey_host_plugin_runtime_server.exe");
    REQUIRE(runtime_server.parent_path() == plugin_path.parent_path());
#endif
}

TEST_CASE("windows suite runtime config points host plugins at shared runtime root",
          "[unit][ofx][runtime][regression]") {
#if !defined(_WIN32)
    SUCCEED("The Windows suite runtime config is only consumed on Windows.");
#else
    const auto temp_root = std::filesystem::temp_directory_path() /
                           ("corridorkey-suite-runtime-config-" +
                            std::to_string(Catch::getSeed()));
    std::filesystem::remove_all(temp_root);
    const auto plugin_path =
        temp_root / "CorridorKey.ofx.bundle" / "Contents" / "Win64" / "CorridorKey.ofx";
    const auto config_path =
        temp_root / "CorridorKey.ofx.bundle" / "Contents" / "Resources" /
        "corridorkey_runtime.ini";
    const auto shared_root = temp_root / "SharedRuntime";
    std::filesystem::create_directories(plugin_path.parent_path());
    std::filesystem::create_directories(config_path.parent_path());
    std::ofstream(config_path) << "[runtime]\nshared_root=" << shared_root.string() << "\n";

    const auto resolved_root = common::host_plugin_shared_runtime_root(plugin_path);
    REQUIRE(resolved_root.has_value());
    REQUIRE(*resolved_root == shared_root);

    const auto runtime_server = resolve_host_plugin_runtime_server_binary(plugin_path);
    REQUIRE(runtime_server == shared_root / "Contents" / "Win64" /
                                  "corridorkey_host_plugin_runtime_server.exe");

    std::filesystem::remove_all(temp_root);
#endif
}

TEST_CASE("windows suite runtime config falls back to installed OFX sidecar for host cache paths",
          "[unit][ofx][runtime][regression]") {
#if !defined(_WIN32)
    SUCCEED("The Windows suite runtime config is only consumed on Windows.");
#else
    const auto temp_root = std::filesystem::temp_directory_path() /
                           ("corridorkey-suite-runtime-standard-sidecar-" +
                            std::to_string(Catch::getSeed()));
    std::filesystem::remove_all(temp_root);
    const auto common_files_root = temp_root / "Common Files";
    const auto shared_root = temp_root / "SharedRuntime";
    const auto config_path = common_files_root / "OFX" / "Plugins" /
                             "CorridorKey.ofx.bundle" / "Contents" / "Resources" /
                             "corridorkey_runtime.ini";
    const auto host_cache_plugin_path =
        temp_root / "ResolveCache" / "CorridorKey.ofx";

    ScopedEnvironmentVariable common_files("CommonProgramFiles",
                                           common_files_root.string());
    ScopedEnvironmentVariable shared_runtime_override("CORRIDORKEY_SHARED_RUNTIME_ROOT",
                                                      std::nullopt);
    ScopedEnvironmentVariable runtime_server_override("CORRIDORKEY_HOST_PLUGIN_RUNTIME_SERVER",
                                                      std::nullopt);

    std::filesystem::create_directories(config_path.parent_path());
    std::ofstream(config_path) << "[runtime]\nshared_root=" << shared_root.string() << "\n";

    const auto resolved_root = common::host_plugin_shared_runtime_root(host_cache_plugin_path);
    REQUIRE(resolved_root.has_value());
    REQUIRE(*resolved_root == shared_root);

    const auto runtime_server =
        resolve_host_plugin_runtime_server_binary(host_cache_plugin_path);
    REQUIRE(runtime_server == shared_root / "Contents" / "Win64" /
                                  "corridorkey_host_plugin_runtime_server.exe");

    std::filesystem::remove_all(temp_root);
#endif
}

TEST_CASE("host plugin runtime family separates ORT TensorRT and TorchTRT artifacts",
          "[unit][ofx][runtime][regression]") {
    REQUIRE(host_plugin_runtime_family_for_backend_and_artifact(
                Backend::TensorRT, std::filesystem::path("corridorkey_fp16_2048.onnx")) ==
            HostPluginRuntimeFamily::OrtTensorRt);
    REQUIRE(host_plugin_runtime_family_for_backend_and_artifact(
                Backend::TorchTRT, std::filesystem::path("corridorkey_dynamic_blue_fp16.ts")) ==
            HostPluginRuntimeFamily::TorchTrt);
    REQUIRE(host_plugin_runtime_family_for_backend_and_artifact(
                Backend::CPU, std::filesystem::path("corridorkey_fp16_2048.onnx")) ==
            HostPluginRuntimeFamily::Other);

    REQUIRE(should_restart_for_host_plugin_runtime_family_switch(
        HostPluginRuntimeFamily::OrtTensorRt, HostPluginRuntimeFamily::TorchTrt));
    REQUIRE(should_restart_for_host_plugin_runtime_family_switch(
        HostPluginRuntimeFamily::TorchTrt, HostPluginRuntimeFamily::OrtTensorRt));
    REQUIRE_FALSE(should_restart_for_host_plugin_runtime_family_switch(
        HostPluginRuntimeFamily::OrtTensorRt, HostPluginRuntimeFamily::OrtTensorRt));
    REQUIRE_FALSE(should_restart_for_host_plugin_runtime_family_switch(
        HostPluginRuntimeFamily::Other, HostPluginRuntimeFamily::TorchTrt));
}

TEST_CASE("host plugin runtime family follows the prepare request executable artifact",
          "[unit][ofx][runtime][regression]") {
    HostPluginRuntimePrepareSessionRequest green_request;
    green_request.requested_device.backend = Backend::TensorRT;
    green_request.model_path = "models/corridorkey_fp16_2048.onnx";

    HostPluginRuntimePrepareSessionRequest blue_request;
    blue_request.requested_device.backend = Backend::TorchTRT;
    blue_request.model_path = "models/corridorkey_dynamic_blue_fp16.ts";

    REQUIRE(host_plugin_runtime_family_for_prepare_request(green_request) ==
            HostPluginRuntimeFamily::OrtTensorRt);
    REQUIRE(host_plugin_runtime_family_for_prepare_request(blue_request) ==
            HostPluginRuntimeFamily::TorchTrt);
    REQUIRE(should_restart_for_host_plugin_runtime_family_switch(
        host_plugin_runtime_family_for_prepare_request(green_request),
        host_plugin_runtime_family_for_prepare_request(blue_request)));
}

// NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
