# Task `0006`: Probe NPP TorchTRT Output Pack

**Status:** archived
**Created:** 2026-05-10
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**Outcome:** falsified
**Board ref:**

## Context

The current Resolve/TorchTRT investigation shows the largest output-side bucket
inside `torchtrt_output_copy_sync`, but the measured transfer itself is small.
The latest Resolve runtime log split shows `torchtrt_output_producer_wait_sync`
around the slow path while `torchtrt_output_transfer_sync` stays in single-digit
milliseconds. That means the next implementation must attack GPU producer work
that runs before the D2H copy can complete, not raw host-copy bandwidth.

The candidate under test is the foreground output pack in
`src/core/torch_trt_session.cpp`. The current CUDA path materializes foreground
with `fg_nchw.permute({0, 2, 3, 1}).contiguous().view({-1})` before queuing the
device-to-host copy. Official NVIDIA NPP documentation exposes the exact
planar-to-packed primitive for this shape, `nppiCopy_32f_P3C3R_Ctx`, and the
repository already uses the inverse `nppiCopy_32f_C3P3R_Ctx` pattern in
`src/core/gpu_prep.cpp` for input preparation. Official CUDA stream/event and
async-copy semantics explain why this producer work is observed at the later
copy synchronization point.

Pre-implementation history check:

- `rg -n "P3C3R|C3P3R|planar.*packed|packed.*planar|torchtrt_output_pack|permute\(\{0, 2, 3, 1\}\)|nppiCopy_32f" src tests include doc docs .planning scripts`
  finds current inverse input prep in `src/core/gpu_prep.cpp` and the current
  PyTorch foreground pack in `src/core/torch_trt_session.cpp`; it does not find
  a current NPP planar-to-packed TorchTRT output pack.
- `git log --all --oneline -S "nppiCopy_32f_P3C3R" -- src include tests doc docs scripts`
  identifies `3bcc287` and `586777a`, both in the older `GpuResizer` /
  `gpu_resize.cpp` history. `3bcc287` added a non-`_Ctx` NPP planar-to-packed
  interleave after GPU resize, and `586777a` removed that interleaved path while
  canonicalizing blue-screen flow.
- `git log --all --oneline -G "nppiCopy_32f_P3C3R|P3C3R|planar.*packed|packed.*planar|permute\(\{0, 2, 3, 1\}\)|torchtrt_output_pack" -- src/core src/app src/plugins tests doc docs scripts`
  shows current TorchTRT output-pack changes in `4369213` and `8d13fd4`, but
  no NPP `P3C3R` implementation in `src/core/torch_trt_session.cpp`.

The scoped assumption is therefore: the older NPP planar-to-packed resize path
was a related ONNX/GPU-resize attempt, but the exact current TorchTRT output
pack replacement has not been tried on this branch's measured output producer
wait.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [x] The implementation either uses `nppiCopy_32f_P3C3R_Ctx` for the CUDA
  foreground pack in `src/core/torch_trt_session.cpp` or records why the exact
  NPP primitive is invalid for the current tensor/output layout.
- [x] The PyTorch pack path remains as a fallback when NPP setup or execution
  cannot be used.
- [x] Alpha output behavior, foreground dimensions, source-passthrough behavior,
  despill behavior, and external shared output views remain unchanged.
- [x] Telemetry separates NPP foreground pack enqueue/fallback from the existing
  `torchtrt_output_pack`, `torchtrt_output_producer_wait_sync`, and
  `torchtrt_output_transfer_sync` stages.
- [x] Automated measurement uses the same Green 2048, 3840x2160 plate,
  Lanczos4, Source Passthrough on, `sp_erode=12`, `sp_blur=28` harness class as
  the latest verified output-wait baseline.
- [x] The change is accepted for packaging only if automated measurement shows
  at least a 10% reduction in `avg_latency_ms` or
  `torchtrt_output_producer_wait_sync`; otherwise the task is closed as
  falsified without requesting manual Resolve testing.
- [x] `scripts/windows.ps1 -Task build -Preset release -Version 0.8.5` and the
  relevant unit/integration gates pass.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [x] Re-open the current implementation in `src/core/torch_trt_session.cpp`
  around `materialize_outputs`, `resize_output_if_needed`, and
  `torchtrt_output_pack`.
- [x] Add the smallest CUDA/NPP helper needed to pack 3 planar float foreground
  planes into the existing packed host-output destination shape on the current
  TorchTRT work stream.
- [x] Preserve the current PyTorch `permute(...).contiguous()` path as fallback
  and make fallback visible in stage timings.
- [x] Keep output registration, direct shared-frame writes, and D2H copy ordering
  unchanged except for the foreground source pointer used by the D2H copy.
- [x] Run `git diff --check`.
- [x] Run the canonical Windows release build through `scripts/windows.ps1`.
- [x] Run focused tests covering TorchTRT, GPU prep/NPP linkage, OFX runtime
  client transport, and lifecycle cache behavior.
- [x] Run the matching OFX RPC Green 2048 harness and compare against
  `build/release/task0005_rpc_green_2048_registered_shared_frame_restricted_60f.json`
  and `build/release/task0005_rpc_green_2048_final_default_graph_off.json`
  where present.
- [x] Package or request manual Resolve validation only after the automated
  acceptance threshold is met.

## Notes

The probe implementation used `nppiCopy_32f_P3C3R_Ctx` on the current TorchTRT
work stream with separate telemetry for
`torchtrt_output_pack_foreground_npp_allocate`,
`torchtrt_output_pack_foreground_npp_enqueue`, and the PyTorch fallback path.
The first build failed at link because the TorchTRT DLL target did not link the
NPP data-exchange library that owns `nppiCopy_32f_P3C3R_Ctx`; adding
`CUDA::nppidei` to the candidate target fixed the link. The validated candidate
was then measured and rejected before packaging because it did not meet the
task's 10% automated acceptance threshold. The production source was restored to
the PyTorch output pack path after the falsifying measurement.

Verification completed:
`git diff --check`;
`powershell -ExecutionPolicy Bypass -File .\scripts\windows.ps1 -Task build -Preset release -Version 0.8.5`;
`.\build\release\tests\unit\test_unit.exe "GpuInputPrep*"`;
`.\build\release\tests\unit\test_unit.exe "[runtime]"`;
`.\build\release\tests\unit\test_unit.exe "[cache]"`;
`.\build\release\tests\integration\test_integration.exe "[runtime]"`;
`ctest --test-dir build\release -R "torchtrt_dynamic_runner" --output-on-failure`.
The direct TorchTRT integration gate was invoked with
`.\build\release\tests\integration\test_integration.exe "[torchtrt]"`, but all
six TorchTRT cases were skipped because the local dynamic and Sprint 0 TorchTRT
fixtures were not staged under `temp/`.

The matching Green 2048 OFX RPC harness wrote
`build/release/task0006_rpc_green_2048_npp_output_pack_60f.json` with 60
prepared shared-frame iterations, 3840x2160 plate input, Source Passthrough on,
Lanczos4, `sp_erode=12`, and `sp_blur=28`. Compared with
`build/release/task0005_rpc_green_2048_registered_shared_frame_restricted_60f.json`,
`avg_latency_ms` changed from `338.56` to `333.22` (`-1.6%`), while
`torchtrt_output_producer_wait_sync` changed from `295.50 ms` to `309.26 ms`
(`+4.7%`). The candidate did reduce `torchtrt_output_pack` from `0.0419 ms` to
`0.0256 ms`, and the NPP foreground enqueue averaged `0.0198 ms`, but that work
was not the source of the output producer wait.

`scripts/compare_benchmarks.py` was also run against UTF-8 copies of both
requested task 0005 baselines. The older
`task0005_rpc_green_2048_final_default_graph_off.json` comparison showed lower
overall latency for the candidate, but that baseline does not use the same
prepared shared-frame harness class and does not control the acceptance decision.
Per the acceptance criterion, no manual Resolve validation or packaging request
is needed for this rejected candidate.

## Archive Decision

This task is closed and archived. The NPP foreground output-pack candidate was
measured, rejected by its automated acceptance threshold, and removed from the
production source. No follow-up work remains for this candidate under the
dedicated-node direction.

## Definition of Done

All Acceptance Criteria checked, plus:

- [x] Local tests pass (or N/A documented in Notes)
- [x] Code review N/A because the production code change was rejected before
  retention
- [x] No orphan `TODO`/`FIXME` introduced
- [x] Status updated to `archived`; outcome remains `falsified`
