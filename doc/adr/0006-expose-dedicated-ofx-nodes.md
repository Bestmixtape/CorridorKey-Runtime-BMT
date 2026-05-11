# ADR-0006: Expose Dedicated OFX Nodes

**Status:** accepted
**Date:** 2026-05-10
**Deciders:** Runtime maintainers

## Context

The Green TorchTRT investigation did not produce a safe release path for the
legacy Green node. The accepted product direction in
`doc/specs/0002-dedicated-screen-nodes.md` keeps Green on the ONNX Runtime
TensorRT path from `main` and exposes Blue as the Torch-TensorRT path.

The current OFX plugin exposes one descriptor through `OfxGetNumberOfPlugins`
and persists the legacy identifier `com.corridorkey.resolve`. The code comments
state that changing the legacy identifier would orphan existing Resolve
projects. A separate Blue node needs its own persisted OFX identity so users can
place Green and Blue nodes in the same Resolve graph without backend or
screen-color policy coercion.

## Decision

We will ship one OFX bundle that exposes two OFX plugin descriptors:

- The legacy Green descriptor keeps the persisted identifier
  `com.corridorkey.resolve` and its existing label.
- The Blue descriptor uses the stable reverse-DNS identifier
  `com.corridorkey.resolve.blue` and the user-visible label `CorridorKey Blue`.

Both identifier strings and the Blue label are persisted product contracts.
They are locked at acceptance of this ADR and may not be renamed without a
superseding ADR.

The bundle remains one installable plugin package for now. Runtime selection,
model selection, session caching, diagnostics, and packaging must treat the two
descriptors as separate node identities.

## Consequences

Existing Resolve projects continue to load through the legacy Green descriptor.

Users can place Green and Blue nodes independently, and the implementation can
make Green depend on ONNX Runtime TensorRT while Blue depends on Torch-TensorRT.

The OFX entrypoint must return two descriptors and tests must assert descriptor
count, identifier stability, label distinctness, and invalid-index behavior.

The Blue identifier becomes a persisted product contract after acceptance, so it
must be chosen once and covered by tests before release.

Packaging stays simpler than two separate bundles, but the mixed package must
stage and validate both runtime families without making Blue dependencies block
Green.

## Alternatives Considered

* Keep one mutable OFX node - rejected because multiple live nodes can coerce or
  conflict across screen color, backend, quality, and model selection.
* Replace the legacy identifier with a new Green identifier - rejected because
  saved Resolve projects depend on `com.corridorkey.resolve`.
* Ship separate Green and Blue OFX bundles first - rejected for the first
  dedicated-node implementation because it adds installer and host-discovery
  complexity before proving the descriptor split.
* Continue Green TorchTRT optimization instead of splitting nodes - rejected
  because the investigation was archived and Green returns to the ONNX Runtime
  TensorRT path from `main`.
