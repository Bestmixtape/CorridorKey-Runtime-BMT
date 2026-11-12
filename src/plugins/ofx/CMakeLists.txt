set(_corridorkey_ofx_root "${CMAKE_CURRENT_SOURCE_DIR}")
set(_corridorkey_ofx_sdk_root "${CMAKE_SOURCE_DIR}/vendor/openfx")

if(NOT EXISTS "${_corridorkey_ofx_sdk_root}/include/ofxImageEffect.h")
    message(FATAL_ERROR
        "OpenFX SDK not found at ${_corridorkey_ofx_sdk_root}. Run: git clone https://github.com/AcademySoftwareFoundation/openfx vendor/openfx")
endif()

set(_corridorkey_ofx_sources
    ofx_actions.cpp
    ofx_frame_cache.cpp
    ofx_frame_cache.hpp
    ofx_image_utils.cpp
    ofx_instance.cpp
    ofx_logging.cpp
    ofx_matte_export.cpp
    ofx_matte_export.hpp
    ofx_plugin.cpp
    ofx_plugin_descriptors.cpp
    ofx_plugin_descriptors.hpp
    ofx_render.cpp
    ofx_image_utils.hpp
    ofx_status_overlay.cpp
    ofx_status_overlay.hpp
    ofx_logging.hpp
    ofx_shared.hpp
)

if(APPLE)
    list(APPEND _corridorkey_ofx_sources ofx_matte_save_panel.mm)
endif()

if(WIN32)
    add_library(corridorkey_ofx SHARED ${_corridorkey_ofx_sources})
else()
    add_library(corridorkey_ofx MODULE ${_corridorkey_ofx_sources})
endif()

target_include_directories(corridorkey_ofx PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${_corridorkey_ofx_sdk_root}/include
    ${CMAKE_SOURCE_DIR}/third_party/stb
    ${CMAKE_BINARY_DIR}/generated
    ${CMAKE_BINARY_DIR}/generated/include
)

# The .ofx links exclusively against corridorkey_common (no ONNX Runtime).
# All inference work flows through corridorkey_host_plugin_runtime_server.exe over
# IPC, which has its own loader namespace and is therefore immune to the
# host-process CUDA-stack collision that causes ERROR_DLL_INIT_FAILED (1114)
# in Foundry Nuke. Validate via `dumpbin -imports CorridorKey.ofx` after
# every link: onnxruntime.dll must not appear in the dependents list.
target_link_libraries(corridorkey_ofx PRIVATE corridorkey_common)
if(APPLE)
    # corridorkey_common's alpha_edge.cpp / color_utils.cpp objects emit
    # vDSP_vclip / vDSP_vmul references (src/common/accelerate_utils.hpp,
    # #ifdef __APPLE__). Only corridorkey_core names '-framework Accelerate'
    # and the .ofx links just the static common lib, so the framework must
    # be on the plugin's own link line. System framework: does not violate
    # the no-ORT/no-MLX import contract checked by the CI verify step.
    target_link_libraries(corridorkey_ofx PRIVATE "-framework Accelerate")
    # ofx_matte_save_panel.mm uses AppKit (NSSavePanel).
    target_link_libraries(corridorkey_ofx PRIVATE "-framework AppKit")
    # ofx_matte_save_panel.mm references UTType (NSSavePanel.allowedContentTypes);
    # AppKit alone does not provide it — the UT class lives in its own framework.
    target_link_libraries(corridorkey_ofx PRIVATE "-framework UniformTypeIdentifiers")
endif()
if(WIN32)
    # ofx_matte_export.cpp uses IFileSaveDialog (CoCreateInstance, ole32)
    # and shell32 for IShellItem.
    target_link_libraries(corridorkey_ofx PRIVATE ole32 shell32)
endif()
corridorkey_apply_windows_common_compile_defs(corridorkey_ofx)

if(MSVC)
    target_compile_options(corridorkey_ofx PRIVATE /W4 /WX /permissive-)
else()
    target_compile_options(corridorkey_ofx PRIVATE -Wall -Wextra -Wpedantic -Werror)
endif()

set_target_properties(corridorkey_ofx PROPERTIES
    PREFIX ""
    # BMT Build: file name carries the community branding; the OFX bundle dir
    # below is renamed to match (folder/file pair must stay identical).
    OUTPUT_NAME "CorridorKey-BMT"
    SUFFIX ".ofx"
)

if(WIN32)
    # The .ofx no longer references ONNX Runtime symbols directly: every
    # inference call goes through corridorkey_host_plugin_runtime_server.exe over
    # IPC, so the plugin DLL is intentionally ORT-import-free. Drop the
    # delay-load infrastructure (delayimp.lib + /DELAYLOAD:onnxruntime.dll)
    # along with the win_delayload_hook source. The bundle still ships
    # onnxruntime.dll for the server process, but the host's loader
    # (Foundry Nuke ships cudart64_12.dll 12.8 next to its executable)
    # cannot drag the plugin into a CUDA-version conflict because the
    # plugin import table no longer mentions onnxruntime.dll at all.
    # Validate via `dumpbin -imports CorridorKey.ofx` before each release.
    corridorkey_apply_windows_x64_link_dirs(corridorkey_ofx)
endif()

# BMT packaging switch: ON (default, dev workflow) copies the models/ pack
# into the OFX bundle at post-build. Release packaging configures
# -DCORRIDORKEY_BUNDLE_MODELS=OFF so the ~2.4 GB pack stays out of the
# bundle; the plugin then downloads it on first run into
# %LOCALAPPDATA%\CorridorKey\models (see src/app/model_fetch.cpp).
option(CORRIDORKEY_BUNDLE_MODELS "Copy the models/ pack into the OFX bundle" ON)

if(WIN32)
    add_dependencies(corridorkey_ofx corridorkey_cli corridorkey_host_plugin_runtime_server)
    # Package the OFX bundle (BMT Build: bundle dir name pairs with OUTPUT_NAME)
    set(_ofx_bundle_dir "${CMAKE_BINARY_DIR}/CorridorKey-BMT.ofx.bundle")
    file(GLOB _corridorkey_host_plugin_runtime_dlls
        "${CORRIDORKEY_ORT_RUNTIME_DIR}/*.dll")

    # ------------------------------------------------------------------
    # BMT v0.4: CorridorKey 2.0 Python worker stack, staged INTO the OFX
    # bundle so the zip/Inno/WiX packagers inherit it with no extra steps
    # (they already take Contents/** recursively) and the plugin launcher
    # finds Contents/Win64/runtime/python/python.exe + runtime/worker/.
    # Heavy material (torch cu128 env, ck2 weights/VFMs) deliberately
    # stays out of the bundle/installer: it is fetched at install time by
    # corridorkey_model_fetch --worker into %LOCALAPPDATA%\CorridorKey2.0-BMT\worker.
    # ------------------------------------------------------------------
    set(_pyembed_zip "${CMAKE_BINARY_DIR}/_pyembed/python-3.12.10-embed-amd64.zip")
    if(NOT EXISTS "${_pyembed_zip}")
        file(DOWNLOAD "https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip"
            "${_pyembed_zip}"
            EXPECTED_HASH SHA256=4acbed6dd1c744b0376e3b1cf57ce906f9dc9e95e68824584c8099a63025a3c3
            INACTIVITY_TIMEOUT 30 SHOW_PROGRESS
            STATUS _pyembed_status)
        list(GET _pyembed_status 0 _pyembed_rc)
        if(NOT _pyembed_rc EQUAL 0)
            list(GET _pyembed_status 1 _pyembed_err)
            file(REMOVE "${_pyembed_zip}")
            message(WARNING
                "BMT v0.4: CPython 3.12.10 embeddable download failed (${_pyembed_err}). "
                "The bundle will ship WITHOUT the Python runtime bootstrap and the "
                "install-time worker fetch will fail. Rebuild with network access.")
        endif()
    endif()
    set(_ofx_runtime_dir "${_ofx_bundle_dir}/Contents/Win64/runtime")
    if(EXISTS "${_pyembed_zip}")
        # Extract CPython embeddable at configure time (cheap, cached by the
        # zip hash above) so only file copies remain at post-build.
        file(MAKE_DIRECTORY "${_ofx_runtime_dir}/python")
        file(ARCHIVE_EXTRACT INPUT "${_pyembed_zip}"
            DESTINATION "${_ofx_runtime_dir}/python")
        # The embeddable's shipped python312._pth comments out `import site`,
        # which strands pip installs. Write our own: site-packages on path,
        # site enabled, so get-pip + the worker-env fetch land importably.
        file(GENERATE OUTPUT "${_ofx_runtime_dir}/python/python312._pth"
            CONTENT "python312.zip
.
Lib
Lib/site-packages
import site
")
        file(MAKE_DIRECTORY "${_ofx_runtime_dir}/python/Lib/site-packages")
        set(_ofx_runtime_bootstrap_commands
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_runtime_dir}/worker"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${CMAKE_SOURCE_DIR}/scripts/packaging/worker-src/bmt_worker.py"
                "${_ofx_runtime_dir}/worker/bmt_worker.py"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${CMAKE_SOURCE_DIR}/scripts/packaging/worker-src/requirements-win.txt"
                "${_ofx_runtime_dir}/worker/requirements-win.txt"
            COMMAND ${CMAKE_COMMAND} -E copy_directory
                "${CMAKE_SOURCE_DIR}/scripts/packaging/worker-src/corridorkey"
                "${_ofx_runtime_dir}/worker/corridorkey")
    else()
        set(_ofx_runtime_bootstrap_commands COMMAND ${CMAKE_COMMAND} -E true)
    endif()

    # FindCUDAToolkit maps CUDA::nppc et al. to import libs, so
    # $<TARGET_RUNTIME_DLLS:corridorkey_ofx> cannot find them. We collect
    # them explicitly from the toolkit bin dir to prevent a Windows loader
    # failure when Resolve loads the plugin on a machine without CUDA installed.
    set(_corridorkey_ofx_cuda_dlls)
    if(CORRIDORKEY_HAS_CUDA AND CUDAToolkit_BIN_DIR)
        foreach(_npp_name nppc64_12 nppial64_12 nppidei64_12 nppif64_12 nppig64_12)
            set(_npp_path "${CUDAToolkit_BIN_DIR}/${_npp_name}.dll")
            if(EXISTS "${_npp_path}")
                list(APPEND _corridorkey_ofx_cuda_dlls "${_npp_path}")
            endif()
        endforeach()
    endif()

    # Visual C++ Redistributable DLLs to ship app-local in the bundle.
    # Discovered by InstallRequiredSystemLibraries in the root CMakeLists.txt
    # (rationale and MS-doc citations live there). Empty list on non-MSVC or
    # when the toolchain is missing the Redist component, in which case the
    # post-build commands below degrade to the historical staging.
    set(_corridorkey_ofx_vcredist_dlls)
    if(MSVC AND CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS)
        list(APPEND _corridorkey_ofx_vcredist_dlls
            ${CMAKE_INSTALL_SYSTEM_RUNTIME_LIBS})
    endif()

    if(CORRIDORKEY_HAS_TORCHTRT)
        set(_corridorkey_ofx_copy_torchtrt_wrapper
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                $<TARGET_FILE:corridorkey_torchtrt>
                "${_ofx_bundle_dir}/Contents/Resources/torchtrt-runtime/bin/")
    else()
        set(_corridorkey_ofx_copy_torchtrt_wrapper
            COMMAND ${CMAKE_COMMAND} -E true)
    endif()

    if(_corridorkey_host_plugin_runtime_dlls)
        if(CORRIDORKEY_BUNDLE_MODELS)
            set(_corridorkey_bundle_models_command
                COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/models" "${_ofx_bundle_dir}/Contents/Resources/models")
        else()
            set(_corridorkey_bundle_models_command COMMAND ${CMAKE_COMMAND} -E true)
        endif()
        add_custom_command(TARGET corridorkey_ofx POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                ${_corridorkey_host_plugin_runtime_dlls}
                ${_corridorkey_ofx_cuda_dlls}
                $<TARGET_RUNTIME_DLLS:corridorkey_ofx>
                "$<TARGET_FILE_DIR:corridorkey_ofx>"
            # Create bundle directories
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Win64"
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Resources/torchtrt-runtime/bin"
            COMMAND ${CMAKE_COMMAND} -E rm -f
                "${_ofx_bundle_dir}/Contents/Win64/corridorkey_ofx_runtime_server.exe"

            # Copy the plugin binary
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_ofx>" "${_ofx_bundle_dir}/Contents/Win64/"
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_cli>" "${_ofx_bundle_dir}/Contents/Win64/"
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_host_plugin_runtime_server>" "${_ofx_bundle_dir}/Contents/Win64/"
            ${_corridorkey_ofx_copy_torchtrt_wrapper}

            # Copy all auxiliary ONNX Runtime and TensorRT DLLs
            COMMAND ${CMAKE_COMMAND} -E copy_directory "${CORRIDORKEY_ORT_RUNTIME_DIR}" "${_ofx_bundle_dir}/Contents/Win64/"

            # Copy transitive runtime DLLs (cpr/libcurl/OpenSSL/zlib for the
            # in-plugin update check) PLUS the Visual C++ Redistributable
            # DLLs discovered by InstallRequiredSystemLibraries. The Redist
            # set is what makes the sidecar bind a known-good MSVCP140.dll
            # next to its own .exe instead of inheriting whatever the host
            # process pinned via SetDllDirectory (Issue #56). Empty generator
            # expression / list is a no-op, so this stays safe on toolchains
            # without dynamic deps or without the Redist component installed.
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                ${_corridorkey_ofx_cuda_dlls}
                ${_corridorkey_ofx_vcredist_dlls}
                $<TARGET_RUNTIME_DLLS:corridorkey_ofx>
                "${_ofx_bundle_dir}/Contents/Win64/"

            # Copy models (skipped when CORRIDORKEY_BUNDLE_MODELS=OFF)
            ${_corridorkey_bundle_models_command}

            # v0.4: Python worker stack (embedded CPython extracted at
            # configure time; worker sources copied here)
            ${_ofx_runtime_bootstrap_commands}

            COMMAND_EXPAND_LISTS
            COMMENT "Packaging OFX bundle into ${_ofx_bundle_dir}..."
        )
    else()
        if(CORRIDORKEY_BUNDLE_MODELS)
            set(_corridorkey_bundle_models_command
                COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/models" "${_ofx_bundle_dir}/Contents/Resources/models")
        else()
            set(_corridorkey_bundle_models_command COMMAND ${CMAKE_COMMAND} -E true)
        endif()
        add_custom_command(TARGET corridorkey_ofx POST_BUILD
            # Create bundle directories
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Win64"
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Resources/torchtrt-runtime/bin"
            COMMAND ${CMAKE_COMMAND} -E rm -f
                "${_ofx_bundle_dir}/Contents/Win64/corridorkey_ofx_runtime_server.exe"

            # Copy the plugin binary
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_ofx>" "${_ofx_bundle_dir}/Contents/Win64/"
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_cli>" "${_ofx_bundle_dir}/Contents/Win64/"
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_host_plugin_runtime_server>" "${_ofx_bundle_dir}/Contents/Win64/"
            ${_corridorkey_ofx_copy_torchtrt_wrapper}

            # Copy all auxiliary ONNX Runtime and TensorRT DLLs
            COMMAND ${CMAKE_COMMAND} -E copy_directory "${CORRIDORKEY_ORT_RUNTIME_DIR}" "${_ofx_bundle_dir}/Contents/Win64/"

            # Copy transitive runtime DLLs + Visual C++ Redistributable.
            # See the parallel block above for the per-list rationale.
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                ${_corridorkey_ofx_cuda_dlls}
                ${_corridorkey_ofx_vcredist_dlls}
                $<TARGET_RUNTIME_DLLS:corridorkey_ofx>
                "${_ofx_bundle_dir}/Contents/Win64/"

            # Copy models (skipped when CORRIDORKEY_BUNDLE_MODELS=OFF)
            ${_corridorkey_bundle_models_command}

            # v0.4: Python worker stack (embedded CPython extracted at
            # configure time; worker sources copied here)
            ${_ofx_runtime_bootstrap_commands}

            COMMAND_EXPAND_LISTS
            COMMENT "Packaging OFX bundle into ${_ofx_bundle_dir}..."
        )
    endif()

    # BMT v0.2: DejaVu TTFs for the first-run model-download status card
    # (draw_model_pack_overlay via stb_truetype). Plain files; the Inno and
    # WiX packagers walk the bundle recursively, so they ship automatically.
    add_custom_command(TARGET corridorkey_ofx POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Resources/fonts"
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${CMAKE_SOURCE_DIR}/third_party/fonts"
            "${_ofx_bundle_dir}/Contents/Resources/fonts"
        COMMENT "Staging status-card fonts into the OFX bundle..."
    )
elseif(APPLE)
    # BMT macOS (Apple Silicon) OFX bundle per the OpenFX portable bundle
    # spec: Contents/MacOS/ carries the .ofx module, the corridorkey CLI
    # (which doubles as the host-plugin-runtime-server via subcommand, see
    # src/app/host_plugin_runtime_client.cpp) and the vendored
    # libonnxruntime dylib providing GPU inference through the CoreML
    # Execution Provider (Metal). Same import contract as Windows: the
    # .ofx itself never links ONNX Runtime.
    set_target_properties(corridorkey_ofx PROPERTIES
        INSTALL_RPATH "@loader_path"
        BUILD_WITH_INSTALL_RPATH ON
    )

    set(_ofx_bundle_dir "${CMAKE_BINARY_DIR}/CorridorKey-BMT.ofx.bundle")
    set(_ofx_bundle_contents_dir "${_ofx_bundle_dir}/Contents/MacOS")

    # ------------------------------------------------------------------
    # BMT v0.4: CorridorKey 2.0 Python worker stack, mirroring the
    # Contents/Win64/runtime staging in the WIN32 branch above, into
    # Contents/MacOS/runtime. CPython comes from python-build-standalone
    # (astral-sh/python-build-standalone releases) instead of python.org's
    # embed zip: the install_only archive for aarch64-apple-darwin ships
    # bin/python3.12 + lib/python3.12 with pip preinstalled and no ._pth
    # to fix, so `-m pip install -r worker/requirements-mac.txt` lands
    # importably. Tag/asset/sha256 verified against the GitHub releases
    # API (asset digest) and re-verified by file(DOWNLOAD EXPECTED_HASH);
    # the archive's single top-level `python/` dir means we extract INTO
    # runtime/ and get runtime/python/bin/python3.12 verbatim.
    # Heavy material (torch MPS env, ck2 weights/VFMs) deliberately stays
    # out of the bundle/installer: fetched at install time by
    # corridorkey_model_fetch --worker into
    # ~/Library/Application Support/CorridorKey2.0-BMT/worker.
    # ------------------------------------------------------------------
    set(_pbs_tag "20261110")
    set(_pbs_asset "cpython-3.12.16+${_pbs_tag}-aarch64-apple-darwin-install_only.tar.gz")
    set(_pbs_sha256 "e956e60bc9465d577ef8062059aa05cd3a2665b4b8678a2ed24e432368330b8f")
    set(_pbs_url "https://github.com/astral-sh/python-build-standalone/releases/download/${_pbs_tag}/cpython-3.12.16%2B${_pbs_tag}-aarch64-apple-darwin-install_only.tar.gz")
    set(_pbs_tar "${CMAKE_BINARY_DIR}/_pyruntime/${_pbs_asset}")
    if(NOT EXISTS "${_pbs_tar}")
        file(DOWNLOAD "${_pbs_url}" "${_pbs_tar}"
            EXPECTED_HASH SHA256=${_pbs_sha256}
            INACTIVITY_TIMEOUT 30 SHOW_PROGRESS
            STATUS _pbs_status)
        list(GET _pbs_status 0 _pbs_rc)
        if(NOT _pbs_rc EQUAL 0)
            list(GET _pbs_status 1 _pbs_err)
            file(REMOVE "${_pbs_tar}")
            message(WARNING
                "BMT v0.4: CPython 3.12.16 python-build-standalone download failed "
                "(${_pbs_err}). The bundle will ship WITHOUT the Python runtime "
                "bootstrap and the install-time worker fetch will fail. Rebuild "
                "with network access.")
        endif()
    endif()
    set(_ofx_runtime_dir "${_ofx_bundle_dir}/Contents/MacOS/runtime")
    if(EXISTS "${_pbs_tar}")
        # Extract at configure time (cached by the hash above) so only file
        # copies remain at post-build. install_only tarball layout:
        #   python/bin/{python3.12,pip3.12,...}
        #   python/lib/python3.12/... (pip preinstalled in site-packages)
        file(MAKE_DIRECTORY "${_ofx_runtime_dir}")
        file(ARCHIVE_EXTRACT INPUT "${_pbs_tar}"
            DESTINATION "${_ofx_runtime_dir}")
        set(_ofx_runtime_bootstrap_commands
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_runtime_dir}/worker"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${CMAKE_SOURCE_DIR}/scripts/packaging/worker-src/bmt_worker.py"
                "${_ofx_runtime_dir}/worker/bmt_worker.py"
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                "${CMAKE_SOURCE_DIR}/scripts/packaging/worker-src/requirements-mac.txt"
                "${_ofx_runtime_dir}/worker/requirements-mac.txt"
            COMMAND ${CMAKE_COMMAND} -E copy_directory
                "${CMAKE_SOURCE_DIR}/scripts/packaging/worker-src/corridorkey"
                "${_ofx_runtime_dir}/worker/corridorkey")
    else()
        set(_ofx_runtime_bootstrap_commands COMMAND ${CMAKE_COMMAND} -E true)
    endif()

    if(CORRIDORKEY_BUNDLE_MODELS)
        set(_corridorkey_bundle_models_command
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Resources/models"
            COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/models" "${_ofx_bundle_dir}/Contents/Resources/models")
    else()
        set(_corridorkey_bundle_models_command COMMAND ${CMAKE_COMMAND} -E true)
    endif()

    # macOS hosts (Resolve among them) expect a bundle Info.plist at
    # Contents/Info.plist even though OFX discovery keys off the directory
    # name + Mach-O modules.
    configure_file("${_corridorkey_ofx_root}/macos/Info.plist.in"
        "${_ofx_bundle_dir}/Contents/Info.plist" @ONLY)

    # BMT v0.2: status-card fonts (see the Win64 staging comment above).
    add_custom_command(TARGET corridorkey_ofx POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Resources/fonts"
        COMMAND ${CMAKE_COMMAND} -E copy_directory
            "${CMAKE_SOURCE_DIR}/third_party/fonts"
            "${_ofx_bundle_dir}/Contents/Resources/fonts"
        COMMENT "Staging status-card fonts into the macOS OFX bundle..."
    )

    add_custom_command(TARGET corridorkey_ofx POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_contents_dir}"
        COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_ofx>" "${_ofx_bundle_contents_dir}/"
        COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_cli>" "${_ofx_bundle_contents_dir}/"
        COMMAND ${CMAKE_COMMAND} -E copy "${ONNXRUNTIME_DYLIB}" "${_ofx_bundle_contents_dir}/"
        ${_corridorkey_bundle_models_command}
        # v0.4: Python worker stack (python-build-standalone CPython
        # extracted at configure time; worker sources copied here) —
        # mirrors the Win64 runtime staging in the WIN32 branch.
        ${_ofx_runtime_bootstrap_commands}
        COMMENT "Packaging macOS OFX bundle into ${_ofx_bundle_dir}..."
    )

    get_target_property(_corridorkey_core_type corridorkey_core TYPE)
    if(_corridorkey_core_type STREQUAL "SHARED_LIBRARY")
        add_custom_command(TARGET corridorkey_ofx POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_core>" "${_ofx_bundle_contents_dir}/"
            COMMENT "Copying libcorridorkey_core dylib into the macOS bundle..."
        )
    endif()

    # ORT contract: the vendored dylib carries LC_ID_DYLIB
    # @rpath/libonnxruntime.<v>.dylib and (chained fixups) cannot be renamed
    # on the runner, so the bundle ships that exact filename (copy below from
    # ${ONNXRUNTIME_DYLIB}) and core/CLI record the same versioned name.
    # dyld matches name + LC_ID under the @loader_path rpath — nothing to
    # repair, nothing to normalize.

    # BMT: libmlx.dylib (Apple Silicon MLX inference backend) rides along
    # when the root CMakeLists resolved the MLX package (portable bottle or
    # `python -m mlx --cmake-dir`). corridorkey_core links it PRIVATE, so the
    # loader finds @rpath/libmlx.dylib via the @loader_path rpath chain of
    # the loading .ofx/CLI — same contract as libonnxruntime above.
    if(TARGET mlx)
        get_target_property(_corridorkey_mlx_location mlx IMPORTED_LOCATION_RELEASE)
        if(NOT _corridorkey_mlx_location)
            get_target_property(_corridorkey_mlx_location mlx IMPORTED_LOCATION)
        endif()
        if(_corridorkey_mlx_location AND EXISTS "${_corridorkey_mlx_location}")
            add_custom_command(TARGET corridorkey_ofx POST_BUILD
                COMMAND ${CMAKE_COMMAND} -E copy_if_different
                    "${_corridorkey_mlx_location}" "${_ofx_bundle_contents_dir}/libmlx.dylib"
                COMMAND install_name_tool -id "@rpath/libmlx.dylib"
                    "${_ofx_bundle_contents_dir}/libmlx.dylib"
                COMMAND codesign --force --sign - "${_ofx_bundle_contents_dir}/libmlx.dylib"
                COMMENT "Copying libmlx.dylib (MLX backend) into the macOS bundle..."
            )
            # mlx 0.32 has no metalfn dylib: Metal kernels ship as
            # mlx.metallib, which libmlx resolves via dladdr at its own
            # image directory (backend/common/utils.cpp current_binary_dir
            # -> device.cpp load_colocated_library). It must sit beside
            # libmlx.dylib in the bundle; a missing metallib does NOT fail
            # dyld — it throws at the first GPU op, so only a real
            # inference smoke catches it. libjaccl.dylib is a hard dep only
            # in the macosx_26 wheel build; stage it when present.
            get_filename_component(_corridorkey_mlx_dir "${_corridorkey_mlx_location}" DIRECTORY)
            if(EXISTS "${_corridorkey_mlx_dir}/mlx.metallib")
                add_custom_command(TARGET corridorkey_ofx POST_BUILD
                    COMMAND ${CMAKE_COMMAND} -E copy_if_different
                        "${_corridorkey_mlx_dir}/mlx.metallib"
                        "${_ofx_bundle_contents_dir}/mlx.metallib"
                    COMMENT "Copying mlx.metallib (MLX Metal kernels) into the macOS bundle..."
                )
            endif()
            if(EXISTS "${_corridorkey_mlx_dir}/libjaccl.dylib")
                add_custom_command(TARGET corridorkey_ofx POST_BUILD
                    COMMAND ${CMAKE_COMMAND} -E copy_if_different
                        "${_corridorkey_mlx_dir}/libjaccl.dylib"
                        "${_ofx_bundle_contents_dir}/libjaccl.dylib"
                    COMMAND install_name_tool -id "@rpath/libjaccl.dylib"
                        "${_ofx_bundle_contents_dir}/libjaccl.dylib"
                    COMMAND codesign --force --sign -
                        "${_ofx_bundle_contents_dir}/libjaccl.dylib"
                    COMMENT "Copying libjaccl.dylib into the macOS bundle..."
                )
            endif()
        endif()
    endif()
elseif(UNIX AND NOT APPLE)
    # Linux OFX bundle layout per the OpenFX portable bundle spec. Resolve's
    # plugin loader follows the same Contents/<arch>/ convention the macOS
    # bundle uses. We co-locate the CLI (corridorkey) next to the plugin so
    # the runtime-server subcommand and doctor both resolve without PATH.
    # NOTE: add_dependencies(corridorkey_ofx corridorkey_cli) and the CLI's
    # INSTALL_RPATH are set from src/cli/CMakeLists.txt because the cli target
    # is added after src/ in the top-level CMakeLists.txt.

    # $ORIGIN keeps the loader rooted at the plugin file, so libonnxruntime.so
    # and libcorridorkey_core.so picked up from the same Contents/Linux-x86_64/
    # directory regardless of the host's /etc/ld.so.conf or LD_LIBRARY_PATH.
    set_target_properties(corridorkey_ofx PROPERTIES
        INSTALL_RPATH "$ORIGIN"
        BUILD_WITH_INSTALL_RPATH ON
    )

    set(_ofx_bundle_dir "${CMAKE_BINARY_DIR}/CorridorKey.ofx.bundle")
    set(_ofx_bundle_contents_dir "${_ofx_bundle_dir}/Contents/Linux-x86_64")

    # Shared objects shipped inside the bundle. The curated
    # onnxruntime-linux-cuda drop already contains libonnxruntime.so plus the
    # CUDA runtime .so files; packaging scripts copy the remainder of that
    # lib directory alongside the plugin.
    if(CORRIDORKEY_BUNDLE_MODELS)
        set(_corridorkey_bundle_models_command
            COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_dir}/Contents/Resources/models"
            COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/models" "${_ofx_bundle_dir}/Contents/Resources/models")
    else()
        set(_corridorkey_bundle_models_command COMMAND ${CMAKE_COMMAND} -E true)
    endif()
    add_custom_command(TARGET corridorkey_ofx POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E make_directory "${_ofx_bundle_contents_dir}"
        COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_ofx>" "${_ofx_bundle_contents_dir}/"
        COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_cli>" "${_ofx_bundle_contents_dir}/"
        COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:corridorkey_core>" "${_ofx_bundle_contents_dir}/"
        ${_corridorkey_bundle_models_command}
        COMMENT "Staging Linux OFX bundle skeleton at ${_ofx_bundle_dir}..."
    )

    if(CORRIDORKEY_ORT_RUNTIME_DIR AND EXISTS "${CORRIDORKEY_ORT_RUNTIME_DIR}")
        if(CORRIDORKEY_BUNDLE_MODELS)
            set(_corridorkey_bundle_models_command
                COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/models" "${_ofx_bundle_dir}/Contents/Resources/models")
        else()
            set(_corridorkey_bundle_models_command COMMAND ${CMAKE_COMMAND} -E true)
        endif()
        add_custom_command(TARGET corridorkey_ofx POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_directory "${CORRIDORKEY_ORT_RUNTIME_DIR}" "${_ofx_bundle_contents_dir}/"
            COMMENT "Copying curated ONNX Runtime libraries into the Linux bundle..."
        )
    endif()

    # Stage ffmpeg .so files from vcpkg_installed (ffmpeg is built dynamic on
    # this triplet because its yasm-assembled MMX/SSE modules emit non-PIC
    # relocations that fail to link into libcorridorkey_core.so). The $ORIGIN
    # rpath on the plugin and CLI resolves them from the same bundle dir.
    set(_ofx_vcpkg_lib_dir "${CMAKE_BINARY_DIR}/vcpkg_installed/${VCPKG_TARGET_TRIPLET}/lib")
    if(EXISTS "${_ofx_vcpkg_lib_dir}")
        file(GLOB _ofx_vcpkg_shared_objs
            "${_ofx_vcpkg_lib_dir}/libav*.so*"
            "${_ofx_vcpkg_lib_dir}/libsw*.so*")
        if(_ofx_vcpkg_shared_objs)
            if(CORRIDORKEY_BUNDLE_MODELS)
            set(_corridorkey_bundle_models_command
                COMMAND ${CMAKE_COMMAND} -E copy_directory "${CMAKE_SOURCE_DIR}/models" "${_ofx_bundle_dir}/Contents/Resources/models")
        else()
            set(_corridorkey_bundle_models_command COMMAND ${CMAKE_COMMAND} -E true)
        endif()
        add_custom_command(TARGET corridorkey_ofx POST_BUILD
                COMMAND ${CMAKE_COMMAND} -E copy ${_ofx_vcpkg_shared_objs} "${_ofx_bundle_contents_dir}/"
                COMMENT "Copying ffmpeg shared libraries into the Linux bundle..."
            )
        endif()
    endif()

    # Rewrite DT_RUNPATH on the bundle copy of libcorridorkey_core.so from the
    # absolute build-tree paths CMake bakes in at link time to $ORIGIN so the
    # loader resolves its ffmpeg / onnxruntime siblings from the bundle on any
    # end-user machine. CMake's INSTALL_RPATH=$ORIGIN is unusable here because
    # $ORIGIN is not expanded at link time, so downstream targets that link
    # against corridorkey_core could not resolve its transitive deps during
    # their own link step. patchelf rewrites the RUNPATH after all linking is
    # done, so the build-time rpath stays intact and the shipped copy is clean.
    find_program(CORRIDORKEY_PATCHELF patchelf)
    if(NOT CORRIDORKEY_PATCHELF)
        message(FATAL_ERROR
            "patchelf is required to stage the Linux OFX bundle with a portable "
            "$ORIGIN rpath on libcorridorkey_core.so. Install it with "
            "'sudo apt install patchelf' (Debian/Ubuntu) or the distro equivalent.")
    endif()
    add_custom_command(TARGET corridorkey_ofx POST_BUILD
        COMMAND ${CORRIDORKEY_PATCHELF} --set-rpath "\$ORIGIN"
            "${_ofx_bundle_contents_dir}/$<TARGET_FILE_NAME:corridorkey_core>"
        COMMENT "Rewriting libcorridorkey_core.so RUNPATH to \$ORIGIN..."
        VERBATIM
    )
endif()
