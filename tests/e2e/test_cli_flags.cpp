#include <catch2/catch_all.hpp>
#include <chrono>
#include <cstdlib>
#include <filesystem>
#include <fstream>
#include <iterator>
#include <string>

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

#ifndef CLI_EXECUTABLE_PATH
#define CLI_EXECUTABLE_PATH "corridorkey_cli"
#endif

namespace {

std::string quoted(const std::string& value) {
    return "\"" + value + "\"";
}

std::string capture_cli_output(const std::string& arguments, int& result) {
    const auto suffix =
        std::chrono::steady_clock::now().time_since_epoch().count();
    const auto output_path = std::filesystem::temp_directory_path() /
                             ("corridorkey-cli-flags-" + std::to_string(suffix) + ".txt");
#ifdef _WIN32
    const std::string command = "cmd /S /C \"\"" + std::string(CLI_EXECUTABLE_PATH) + "\" " +
                                arguments + " > \"" + output_path.string() + "\" 2>&1\"";
#else
    const std::string command = quoted(CLI_EXECUTABLE_PATH) + " " + arguments + " > " +
                                quoted(output_path.string()) + " 2>&1";
#endif

    result = std::system(command.c_str());

    std::ifstream stream(output_path, std::ios::binary);
    std::string output((std::istreambuf_iterator<char>(stream)),
                       std::istreambuf_iterator<char>());
    stream.close();
    std::filesystem::remove(output_path);
    return output;
}

}  // namespace

TEST_CASE("CLI handles arguments correctly and returns proper exit codes", "[e2e][cli]") {
    std::string exe_path = CLI_EXECUTABLE_PATH;

    SECTION("Executing with --help returns 0") {
        std::string cmd = exe_path + " --help > NUL 2>&1";
        int result = std::system(cmd.c_str());
        REQUIRE(result == 0);
    }

    SECTION("Executing with no arguments returns 0 and prints quickstart") {
        std::string cmd = exe_path + " > NUL 2>&1";
        int result = std::system(cmd.c_str());
        // The CLI explicitly returns 0 and prints a quickstart guide when called with no args
        REQUIRE(result == 0);
    }

    SECTION("Executing with invalid flags returns non-zero code") {
        std::string cmd = exe_path + " --this-is-a-completely-invalid-flag > NUL 2>&1";
        int result = std::system(cmd.c_str());
        REQUIRE(result != 0);
    }
}

TEST_CASE("CLI exposes only public model-pack download choices", "[e2e][cli]") {
    int help_result = 0;
    const std::string help = capture_cli_output("--help", help_result);

    REQUIRE(help_result == 0);
    REQUIRE(help.find("Resolution (0=auto, 512, 1024, 1536, 2048)") != std::string::npos);
    REQUIRE(help.find("Model pack for download only") != std::string::npos);
    REQUIRE(help.find("green") != std::string::npos);
    REQUIRE(help.find("blue") == std::string::npos);
    REQUIRE(help.find("768") == std::string::npos);
    REQUIRE(help.find("int8") == std::string::npos);
    REQUIRE(help.find("fp32") == std::string::npos);

    int download_result = 0;
    const std::string download_output =
        capture_cli_output("download --variant blue", download_result);

    REQUIRE(download_result != 0);
    REQUIRE(download_output.find("Unsupported download variant") != std::string::npos);
}

// NOLINTEND(cppcoreguidelines-pro-bounds-avoid-unchecked-container-access,readability-identifier-length,bugprone-easily-swappable-parameters,readability-function-cognitive-complexity,readability-function-size,cppcoreguidelines-avoid-magic-numbers,modernize-use-designated-initializers,readability-uppercase-literal-suffix,readability-math-missing-parentheses,modernize-use-ranges,modernize-use-starts-ends-with,modernize-use-emplace,modernize-use-auto,modernize-loop-convert,modernize-avoid-c-style-cast,modernize-return-braced-init-list,readability-implicit-bool-conversion,readability-container-contains,readability-redundant-member-init,readability-redundant-string-init,bugprone-narrowing-conversions,cppcoreguidelines-narrowing-conversions,readability-avoid-nested-conditional-operator,modernize-use-nodiscard,readability-make-member-function-const,cppcoreguidelines-pro-type-reinterpret-cast,bugprone-implicit-widening-of-multiplication-result,readability-redundant-inline-specifier,cppcoreguidelines-prefer-member-initializer,performance-unnecessary-value-param,readability-use-concise-preprocessor-directives,readability-else-after-return,readability-string-compare,bugprone-exception-escape,cppcoreguidelines-avoid-c-arrays,modernize-avoid-c-arrays,bugprone-branch-clone,cert-err33-c,readability-redundant-declaration,readability-qualified-auto,modernize-use-scoped-lock,modernize-use-bool-literals,cppcoreguidelines-init-variables,cppcoreguidelines-special-member-functions,cppcoreguidelines-owning-memory,cppcoreguidelines-no-malloc,performance-enum-size,performance-avoid-endl,bugprone-unchecked-optional-access,bugprone-unchecked-string-to-number-conversion,cppcoreguidelines-pro-type-cstyle-cast,modernize-use-using,modernize-use-integer-sign-comparison,cert-dcl50-cpp,cppcoreguidelines-pro-type-const-cast,readability-identifier-naming,modernize-raw-string-literal,readability-container-size-empty,bugprone-command-processor,readability-use-std-min-max,cppcoreguidelines-avoid-non-const-global-variables,bugprone-misplaced-widening-cast,readability-misleading-indentation,cert-env33-c,performance-unnecessary-copy-initialization,readability-named-parameter,readability-isolate-declaration,cert-err34-c,modernize-avoid-variadic-functions,cppcoreguidelines-pro-bounds-constant-array-index)
