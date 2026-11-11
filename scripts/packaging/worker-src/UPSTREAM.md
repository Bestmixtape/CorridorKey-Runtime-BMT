# Vendored CorridorKey 2.0 worker sources

| | |
|---|---|
| Upstream repository | https://github.com/nikopueringer/CorridorKey2.0 |
| Pinned upstream commit | `3b4acd1843ce0541a1da9ea8702144b91a79716b` (2026-11-11) |
| License | Corridor Key Licence v2.0 (CC BY-NC-SA 4.0 + additional terms) — see upstream `LICENSE` and `THIRD_PARTY_NOTICES.md` |

Contents:

- `corridorkey/` — verbatim copy of the upstream 2.0 inference package (installed into the OFX bundle's `runtime/worker/` next to `bmt_worker.py`).
- `bmt_worker.py` — BMT-authored worker shim that drives `corridorkey.runtime.run_inference` frame-by-frame for the OFX plugin.
- `requirements-win.txt` — BMT-authored dependency pins (torch `2.9.1+cu128` from the official PyTorch index; no system CUDA or driver changes).

Model weights (including the three third-party foundation models) are **not** vendored or redistributed here; they are fetched at install time from their official publishers by `corridorkey_model_fetch`, per upstream's `THIRD_PARTY_NOTICES.md`.

This distribution is free and publicly accessible as required by the Corridor Key Licence additional term 2(c). All rights in upstream code remain with Corridor Digital LLC.
