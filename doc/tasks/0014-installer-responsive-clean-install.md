# Task `0014`: Installer: eliminate wpReady freeze + add Clean Install task

**Status:** in-progress
**Created:** 2026-05-11
**Owner:** alexandremendoncaalvaro
**Spec ref:** doc/specs/0002-dedicated-screen-nodes.md
**Board ref:**

## Context

During E2E retesting of the CorridorKey OFX Windows online installer on
2026-05-11 the wizard froze for several seconds after the user clicked
**Install** on `wpReady`. Two `/ad-ground` passes confirmed the root cause
and grounded a single-shape fix that also satisfies a second user-asked
feature (a "Clean install" toggle that bypasses the cache).

`CorridorKeyEnqueueDownloads` — emitted into
`scripts/installer/corridorkey.iss.template` by
`Build-OnlineDownloadQueueProcedure` at
`scripts/installer/build_installer.ps1:559-591` — calls
`CorridorKeyResourceFileSha256Matches` per pack file, which runs
`GetSHA256OfFile` synchronously on the wizard's UI thread. On an upgrade
with the four green models (~600 MB total) plus the blue components
already staged on disk, that is ~600 MB of synchronous hashing inside
`NextButtonClick(wpReady)` before `DownloadPage.Download` is allowed to
start. The wizard appears frozen the entire time.
`CorridorKeyPrepareSelectedPackCaches` — emitted by
`Build-PackCachePrepareProcedure` at
`scripts/installer/build_installer.ps1:510-557` — repeats the same hashing
inside `PrepareToInstall` through `CorridorKeyDeleteResourceFileIfInvalid`,
so the same bytes are read twice per install.

The template already contains the canonical fix shape for the
multi-gigabyte blue runtime pack at
`scripts/installer/corridorkey.iss.template:315-370`:
`CorridorKeyBlueRuntimeCacheValid` reads a small marker file
(`corridorkey_blue_runtime.sha256`) and compares its single line to an
embedded aggregate hash — O(1), no payload reads. Extending that pattern
to the green and blue model packs collapses the pre-flight pack-skip
decision from N per-file SHA256 reads down to one tiny marker read per
pack and eliminates the freeze.

The second deliverable is the user-facing "Clean install" toggle. The
grounded design adds a single `[Tasks]` entry
(`Name: cleaninstall; Flags: unchecked`) and gates the same
`CorridorKeyPrepareSelectedPackCaches` helper on
`WizardIsTaskSelected('cleaninstall')`: when checked, the helper
`DelTree`s every selected component's pack directory and the
`torchtrt-runtime` tree, which bypasses every cache marker so the
existing download path naturally re-pulls every file.

Without this task: every upgrade install on a machine that already has the
packs locally produces a multi-second UI freeze with no visible progress;
users have no first-class way to force a clean reinstall short of manual
filesystem surgery before running the installer.

## Acceptance Criteria

- [ ] AC1 — Pack cache markers: every selected pack writes a small marker
      file (`<dest_subdir>\.cache.sha256` for the model packs; the existing
      `corridorkey_blue_runtime.sha256` already covers blue-runtime) after a
      successful install during `CurStepChanged(ssPostInstall)`. Marker
      content is the aggregate SHA256 of the per-file hashes from the
      manifest, pre-computed at template-generation time and emitted as an
      embedded constant in the rendered `.iss`.
- [ ] AC2 — Pre-flight skip uses the marker:
      `CorridorKeyEnqueueDownloads` skips a pack whose marker exists and
      equals the embedded aggregate hash; only when the marker is absent or
      mismatched does it fall through to per-file `DownloadPage.Add(...)`.
      Inno Setup's post-download SHA256 verification (passed as the third
      argument to `DownloadPage.Add`) remains unchanged, so integrity is
      still checked on every downloaded file.
- [ ] AC3 — No double hash:
      `CorridorKeyPrepareSelectedPackCaches` no longer calls
      `CorridorKeyDeleteResourceFileIfInvalid` (which hashes again). It
      either trusts the AC2 marker decision (cache valid → keep the pack's
      files in place) or, when the marker is mismatched, does a plain
      `CorridorKeyDeleteResourceFile` per file (no hashing).
- [ ] AC4 — Clean install Task: `[Tasks]` gains
      `Name: cleaninstall; Description: "Clean install (delete cached
      models and runtime before download)"; Flags: unchecked`. Default
      unchecked so normal upgrades keep the cache.
- [ ] AC5 — Clean install honors selection: when
      `WizardIsTaskSelected('cleaninstall')` is true,
      `CorridorKeyPrepareSelectedPackCaches` `DelTree`s
      `{app}\Contents\Resources\<dest_subdir>\*` for every selected
      component's pack and `{app}\Contents\Resources\torchtrt-runtime` when
      blue is selected — bypassing every cache marker so every pack
      re-downloads.
- [ ] AC6 — Wizard responsiveness UAT: install the new installer on top of
      an existing valid CorridorKey install. Click **Install** on
      `wpReady`. Wizard advances to the download/extract page within 1
      second. Tested both with Clean install **off** (cache hit → instant
      skip) and Clean install **on** (cache wipe → instant transition to
      the download page).
- [ ] AC7 — No regression to integrity: a corrupted local model file
      (size-matched, hash-mismatched) is still caught — either by Inno's
      post-download SHA256 verification on the `DownloadPage.Add(...)`
      third argument or by the existing post-install validator scan
      (`bundle_validation.json`). Behavior of `bundle_validation.json`
      under a corrupted-pack scenario is unchanged.
- [ ] AC8 — Unit / regression coverage: the new template compiles clean
      under the existing ISCC validation invoked by
      `scripts\windows.ps1 -Task package-ofx`. A smoke check confirms that
      a newly installed pack writes its marker file and that a subsequent
      installer run reads it back successfully (manual UAT documented in
      Notes is acceptable).

## Plan

- [ ] Update `scripts/installer/corridorkey.iss.template`:
  - [ ] Add the `[Tasks]` entry
        `Name: cleaninstall; Description: "Clean install (delete cached
        models and runtime before download)"; Flags: unchecked`.
  - [ ] Add three Pascal helpers to `[Code]`:
        `CorridorKeyPackMarkerPath(const DestSubdir: String): String`,
        `CorridorKeyPackCacheValid(const DestSubdir, ExpectedAggregateSha256: String): Boolean`,
        `CorridorKeyWritePackMarker(const DestSubdir, AggregateSha256: String)`.
  - [ ] Hook `CorridorKeyWritePackMarker` into
        `CurStepChanged(ssPostInstall)` for every selected component pack
        (alongside the existing `CorridorKeyWriteBlueRuntimeCacheMarker`).
- [ ] Update `scripts/installer/build_installer.ps1`:
  - [ ] `Build-PackCachePrepareProcedure`: emit, per selected component,
        an outer
        `if WizardIsTaskSelected('cleaninstall') then begin <DelTree every
        dest_subdir> end else begin <CorridorKeyPackCacheValid check;
        DelTree the whole subdir when stale> end;`. The per-file
        `CorridorKeyDeleteResourceFileIfInvalid` call is removed.
  - [ ] `Build-OnlineDownloadQueueProcedure`: emit, per pack,
        `if not CorridorKeyPackCacheValid('<destSubdir>', '<aggregateHash>')
        then begin <per-file DownloadPage.Add(...)> end;` — one marker
        read per pack instead of N per-file SHA256 reads.
  - [ ] Emit the per-pack aggregate SHA256 constants (the value the
        marker file is expected to contain) into the rendered `.iss` as
        embedded constants computed at packaging time.
  - [ ] Emit the `CorridorKeyWritePackMarker` wiring procedure that runs
        in `CurStepChanged(ssPostInstall)`.
- [ ] Verification on Windows (per the canonical pipeline):
  - [ ] `scripts\windows.ps1 -Task build` clean.
  - [ ] `scripts\windows.ps1 -Task package-ofx -Track rtx -Flavor online`
        produces a new installer and a printed SHA256.
  - [ ] Manual UAT — fresh install (Clean install **off**, default): click
        Install on `wpReady`, wizard advances within 1 second.
  - [ ] Manual UAT — re-install on top of a valid install (Clean install
        **off**): click Install, wizard advances within 1 second
        (cache-hit path).
  - [ ] Manual UAT — re-install on top of a valid install (Clean install
        **on**): wizard wipes the cache, re-downloads every pack, install
        completes normally.
  - [ ] Manual UAT — regression check for commit
        `64415c7` ("fix(ofx): skip sync_private_data panel flush on
        Resolve"): install in Resolve, open project with Green + Blue
        nodes, render frames, **close project**; Resolve survives close.

## Notes

Append-only log. Date each entry. Never rewrite past entries.

### 2026-05-11

Task opened in `in-progress` because the implementation begins
immediately after this file lands; status flips to `done` once every
Acceptance Criterion checkbox above is ticked.

Grounding citations (two `/ad-ground` passes performed today before this
task was registered):

- Inno Setup canonical references:
  [TDownloadWizardPage](https://jrsoftware.org/ishelp/topic_scriptclasses.htm),
  [TasksSection](https://jrsoftware.org/ishelp/topic_taskssection.htm),
  [WizardIsTaskSelected](https://jrsoftware.org/ishelp/topic_isxfunc_wizardistaskselected.htm),
  [DelTree](https://jrsoftware.org/ishelp/topic_isxfunc_deltree.htm),
  [InstallDelete section](https://jrsoftware.org/ishelp/topic_installdeletesection.htm).
- OSS precedent:
  [jrsoftware/ispack — setup.iss](https://github.com/jrsoftware/ispack/blob/main/setup.iss)
  (canonical no-prehash + `Tasks: not …` idiom),
  [davincee/innosetup — iscrypt.iss](https://github.com/davincee/innosetup/blob/main/iscrypt.iss)
  (single-file prehash justified by small payload),
  [jrsoftware/issrc — Examples/CodeDownloadFiles.iss](https://github.com/jrsoftware/issrc/blob/main/Examples/CodeDownloadFiles.iss)
  (the canonical `NextButtonClick(wpReady)` shape our template header at
  line 243 already cites),
  [source-foundry/Hack-windows-installer](https://github.com/source-foundry/Hack-windows-installer/blob/master/src/HackWindowsInstaller.iss)
  (precedent for preferring imperative Pascal Script delete over
  declarative `[InstallDelete]` when files may be locked).
- In-repo precedent: the existing marker pattern at
  `scripts/installer/corridorkey.iss.template:315-370`
  (`CorridorKeyBlueRuntimeCacheValid` + marker file
  `corridorkey_blue_runtime.sha256`) is the canonical O(1) shape this
  task extends to the model packs.

## Definition of Done

All Acceptance Criteria checked, plus:

- [ ] Local tests pass (or N/A documented in Notes)
- [ ] Code review completed (human or fresh-context reviewer per WORKFLOW §10)
- [ ] No orphan `TODO`/`FIXME` introduced
- [ ] Status updated to `done` and Notes log closes the task
