# Application layer implementation. Split between corridorkey_common (ORT-free
# pieces the .ofx needs) and corridorkey_core (rest of the orchestration that
# brings ONNX Runtime in transitively).

# Files that do not reference ONNX Runtime directly or transitively. These go
# in corridorkey_common so the .ofx can call into them without dragging
# onnxruntime.dll into its import table.
set(APP_COMMON_SOURCES
    host_plugin_runtime_client.cpp
    host_plugin_runtime_protocol.cpp
    runtime_contracts.cpp
    model_fetch.cpp
    version_check.cpp
)
target_sources(corridorkey_common PRIVATE ${APP_COMMON_SOURCES})

# Files that orchestrate the inference engine and the host plugin runtime service
# (both pull in src/core/ ORT consumers). These stay in corridorkey_core and
# are only reached through corridorkey_host_plugin_runtime_server.exe / the CLI.
set(APP_CORE_SOURCES
    job_orchestrator.cpp
    model_compiler.cpp
    host_plugin_runtime_service.cpp
    host_plugin_session_broker.cpp
    runtime_contracts_probes.cpp
    runtime_diagnostics.cpp
)
target_sources(corridorkey_core PRIVATE ${APP_CORE_SOURCES})

if(WIN32)
    add_executable(corridorkey_host_plugin_runtime_server WIN32
        host_plugin_runtime_server_main.cpp
    )

    target_include_directories(corridorkey_host_plugin_runtime_server PRIVATE
        ${CMAKE_SOURCE_DIR}/src
    )

    target_link_libraries(corridorkey_host_plugin_runtime_server PRIVATE corridorkey_core)
    corridorkey_apply_windows_common_compile_defs(corridorkey_host_plugin_runtime_server)
    corridorkey_apply_windows_x64_link_dirs(corridorkey_host_plugin_runtime_server)

    if(CORRIDORKEY_HAS_TORCHTRT)
        corridorkey_apply_torchtrt_delayload(corridorkey_host_plugin_runtime_server)
    endif()

    if(MSVC)
        target_compile_options(corridorkey_host_plugin_runtime_server PRIVATE /W4 /WX /permissive-)
    else()
        target_compile_options(corridorkey_host_plugin_runtime_server PRIVATE
            -Wall -Wextra -Wpedantic -Werror)
        if(APPLE)
            # macOS port: platform-specific helpers are unused on Apple builds
            target_compile_options(corridorkey_host_plugin_runtime_server PRIVATE
                -Wno-unused-function -Wno-unused-const-variable -Wno-unused-variable
            -Wno-missing-field-initializers)
        endif()
    endif()

    set_target_properties(corridorkey_host_plugin_runtime_server PROPERTIES
        OUTPUT_NAME "corridorkey_host_plugin_runtime_server"
    )

    set(_corridorkey_host_plugin_runtime_server_runtime_dlls "")
    if(CORRIDORKEY_ORT_RUNTIME_DIR)
        file(GLOB _corridorkey_host_plugin_runtime_server_ort_runtime_dlls
            "${CORRIDORKEY_ORT_RUNTIME_DIR}/*.dll")
        list(APPEND _corridorkey_host_plugin_runtime_server_runtime_dlls
            ${_corridorkey_host_plugin_runtime_server_ort_runtime_dlls})
    endif()
    if(WIN32 AND MSVC AND CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS)
        list(APPEND _corridorkey_host_plugin_runtime_server_runtime_dlls
            ${CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS})
    endif()

    add_custom_command(TARGET corridorkey_host_plugin_runtime_server POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
            $<TARGET_RUNTIME_DLLS:corridorkey_host_plugin_runtime_server>
            ${_corridorkey_host_plugin_runtime_server_runtime_dlls}
            $<TARGET_FILE_DIR:corridorkey_host_plugin_runtime_server>
        COMMAND_EXPAND_LISTS
    )
endif()


# BMT v0.3: installer-side model pack fetcher. The Windows Setup wizard page
# and the macOS installer app drive this console helper and parse its
# unbuffered PLAN/PROGRESS/DONE stdout protocol to render a progress bar
# during installation, so the OFX plugin never downloads models at first use.
# Links only corridorkey_common (ORT-free static slice that already hosts
# model_fetch.cpp), keeping the helper tiny and dependency-portable.
add_executable(corridorkey_model_fetch model_fetch_cli.cpp)
target_include_directories(corridorkey_model_fetch PRIVATE
    ${CMAKE_SOURCE_DIR}/src
)
target_link_libraries(corridorkey_model_fetch PRIVATE corridorkey_common)
if(WIN32)
    # --install-ui progress window (progress bar + labels via Win32 GDI).
    target_link_libraries(corridorkey_model_fetch PRIVATE user32 gdi32)
endif()
corridorkey_apply_windows_common_compile_defs(corridorkey_model_fetch)
if(MSVC)
    target_compile_options(corridorkey_model_fetch PRIVATE /W4 /WX /permissive-)
else()
    target_compile_options(corridorkey_model_fetch PRIVATE -Wall -Wextra -Wpedantic -Werror)
    if(APPLE)
        target_compile_options(corridorkey_model_fetch PRIVATE
            -Wno-unused-function -Wno-unused-const-variable -Wno-unused-variable)
    endif()
endif()
set_target_properties(corridorkey_model_fetch PROPERTIES
    OUTPUT_NAME "corridorkey_model_fetch"
)


# corridorkey_core_static is defined later in src/CMakeLists.txt and inherits
# sources via get_target_property, so we do not wire it up here.
