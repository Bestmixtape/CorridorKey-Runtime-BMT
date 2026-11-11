#pragma once

#include <chrono>
#include <cstdint>
#include <corridorkey/api_export.hpp>
#include <filesystem>

#include "../common/host_plugin_runtime_defaults.hpp"
#include "../common/local_ipc.hpp"
#include "host_plugin_runtime_protocol.hpp"
#include "host_plugin_session_broker.hpp"

namespace corridorkey::app {

struct HostPluginRuntimeServiceOptions {
    common::LocalJsonEndpoint endpoint = {};
    std::chrono::milliseconds idle_timeout = common::kDefaultHostPluginIdleTimeout;
    std::filesystem::path log_path = {};
    HostPluginSessionBrokerOptions broker = {};
    // BMT: PID of the process that launched the server (Resolve's plugin
    // host or the CLI). Non-zero enables a watchdog that terminates this
    // server the moment that process goes away — clean, crash, or kill — so
    // an exited Resolve never leaves an orphaned server holding model
    // sessions. 0 (unknown) keeps only the idle-timeout backstop.
    std::uint64_t parent_pid = 0;
};

class CORRIDORKEY_API HostPluginRuntimeService {
   public:
    static Result<void> run(const HostPluginRuntimeServiceOptions& options);
};

}  // namespace corridorkey::app
