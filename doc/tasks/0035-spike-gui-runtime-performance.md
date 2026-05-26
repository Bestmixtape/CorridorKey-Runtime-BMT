# Task `0035`: Spike GUI Runtime Performance

**Status:** proposed
**Created:** 2026-05-26
**Owner:** Runtime maintainers
**Spec ref:** doc/specs/0003-useful-tauri-gui.md
**Board ref:**

## Context

Users want faster processing and richer progress, but the render hot path is
shared with CLI and host-plugin workflows. The GUI already keeps preview/proxy
work off the webview path. Any deeper change to frame parallelism,
decode/inference/encode pipelining, or preview-frame streaming must be
measured before implementation so a usability improvement does not regress the
runtime.

## Acceptance Criteria

Verifiable conditions. Each as a checkbox so progress is point-editable.

- [ ] Current decode, inference/render, post-process, encode, and preview proxy
      stages are mapped from App/Core code and existing benchmark output.
- [ ] At least three candidate approaches are evaluated: native frame
      parallelism, pipelined decode/inference/encode, and lightweight
      preview-frame streaming.
- [ ] Each candidate records expected user benefit, required App/Core contract,
      risk to CLI/OFX/Adobe behavior, and benchmark needed before coding.
- [ ] No render hot path code changes land in this spike.
- [ ] The spike recommends one implementation task, one explicit rejection, or
      a decision to defer with evidence.
- [ ] Benchmark commands and comparison criteria are recorded, including the
      existing 10 percent regression rule for hot-path changes.

## Plan

Concrete sequential steps. Each as a checkbox. Reference file paths where applicable.

- [ ] Read `docs/OPTIMIZATION_MEASUREMENTS.md`,
      `src/app/job_orchestrator.cpp`, `src/core/engine.cpp`,
      `src/core/inference_session.cpp`, `src/frame_io/`, and
      `src/post_process/`.
- [ ] Run or identify the required `scripts/run_corpus.sh` and
      `scripts/compare_benchmarks.py` baseline for any candidate that touches
      hot-path code.
- [ ] Compare GUI needs against plugin/runtime behavior before proposing an
      App/Core change.
- [ ] Record the spike result in this task Notes and create a follow-up
      implementation task only if evidence supports it.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-26

Task split from `0026`. Grounding: `AGENTS.md` requires measurement against
the `phase_8_gpu_prepare` baseline for hot-path changes and rejects regressions
above 10 percent. Nuke's viewer documentation notes that visible-area caching
can improve playback but full-frame processing exists for workflows that need
it, which maps to this task's rule: optimize deliberately and measure the
trade-off.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW section 10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
