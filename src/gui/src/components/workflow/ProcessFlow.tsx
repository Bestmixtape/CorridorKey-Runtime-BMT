import { open, save } from "@tauri-apps/plugin-dialog";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { useJobStore } from "@/lib/job";
import { useEngineStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Clapperboard,
  Copy,
  FileImage,
  FileVideo,
  FolderDown,
  Layers,
  PlayCircle,
  RotateCcw,
  SlidersHorizontal,
  Square,
  Terminal,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RuntimeCatalogEntry, RuntimeReadiness } from "@/lib/engine";
import {
  fileExtension,
  fileName,
  previewKindForPath,
} from "@/lib/media";
import { createPreviewProxy, formatPreviewError, selectAlphaHintAsset, selectSourceAsset } from "@/lib/preview";
import { jobTelemetrySummary, type JobMetrics, type JobTelemetrySummary } from "@/lib/jobTelemetry";
import {
  comparisonClipStyle,
  comparisonDividerGeometry,
  comparisonPositionFromPoint,
  resolveComparisonState,
  type ViewerComparisonMode
} from "@/lib/viewerCompare";
import { mediaSyncAction } from "@/lib/viewerSync";
import {
  PRECISION_OPTIONS,
  QUALITY_FALLBACK_OPTIONS,
  REFINEMENT_MODE_OPTIONS,
  RESOLUTION_OPTIONS,
  type PrecisionMode,
  type QualityFallbackMode,
  type RefinementMode,
  type RuntimeResolution
} from "@/lib/advancedSettings";
import {
  isOutputPathReady,
  outputArtifactOptions,
  preferredOutputArtifactFamily,
  outputRecipeControlOptions,
  outputRecipeLabel,
  previewBackgroundStyle,
  suggestOutputPathForRecipe,
  type OutputAlphaMode,
  type OutputColorIntent,
  type OutputRecipeSettings,
  type PreviewBackgroundMode
} from "@/lib/outputRecipe";
import { buildDiagnosticSummary } from "@/lib/diagnosticLog";
import { jobRecipeChips } from "@/lib/jobRecipe";

type PreviewMode = "source" | "hint" | "result";
type PreviewSyncRole = "primary" | "secondary";

interface PreviewItem {
  id: PreviewMode;
  label: string;
  badge: string;
  path: string | null;
  pendingPath?: string | null;
  icon: typeof FileVideo;
  emptyTitle: string;
  emptySubtitle: string;
}

interface PreviewVideoSync {
  role: PreviewSyncRole;
  register: (role: PreviewSyncRole, element: HTMLVideoElement | null) => void;
  syncFrom: (role: PreviewSyncRole) => void;
}

export function ProcessFlow() {
  const {
    inputPath, inputSourceMode, setInput,
    outputPath, setOutput,
    hintPath, setHint,
    selectedModelId, setSelectedModelId,
    selectedPresetId, setSelectedPresetId,
    videoEncodeMode, setVideoEncodeMode,
    outputRecipe, setOutputRecipeSetting,
    advancedSettings, setAdvancedSetting,
    defaultOutputDir,
    startJob, cancelJob, isProcessing,
    terminalStatus,
    currentProgress, statusMessage,
    startedAtMs, finishedAtMs,
    error, activeBackend,
    artifactPath, warnings,
    timings, metrics, logs,
    reset
  } = useJobStore();
  const { readiness, getModelChoices, getPresetChoices } = useEngineStore();
  const modelChoices = getModelChoices();
  const presetChoices = getPresetChoices();
  const presetChoiceValues = presetChoices.map(presetOptionValue).filter(Boolean);
  const modelChoiceValues = modelChoices.map(modelOptionValue).filter(Boolean);
  const runtimeUsable = Boolean(readiness && readiness.status !== "error");
  const runtimeOutputRecipeCapabilities = readiness?.info.ok
    ? readiness.info.value?.capabilities?.output_recipe
    : undefined;
  const sourceContext = useMemo(() => ({
    selectedAsFolder: inputSourceMode === "folder"
  }), [inputSourceMode]);
  const artifactOptions = outputArtifactOptions(
    inputPath,
    sourceContext,
    runtimeOutputRecipeCapabilities
  );
  const artifactOption = artifactOptions.find((option) => option.value === outputRecipe.artifactFamily) ?? artifactOptions[0];
  const recipeControls = useMemo(
    () => outputRecipeControlOptions(outputRecipe, runtimeOutputRecipeCapabilities),
    [outputRecipe, runtimeOutputRecipeCapabilities]
  );
  const outputReady = isOutputPathReady(outputPath, outputRecipe);
  const hasRunnableSelection = Boolean(selectedPresetId || selectedModelId);
  const canStart = Boolean(inputPath && outputReady && runtimeUsable && hasRunnableSelection && artifactOption.enabled);
  const canRetry = terminalStatus === "completed" || terminalStatus === "failed" || terminalStatus === "cancelled";

  const [showLogs, setShowLogs] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (presetChoiceValues.length === 0) {
      if (selectedPresetId) {
        setSelectedPresetId(null);
      }
      return;
    }

    if (!selectedPresetId || !presetChoiceValues.includes(selectedPresetId)) {
      setSelectedPresetId(presetChoiceValues[0]);
    }
  }, [
    presetChoiceValues.join("|"),
    selectedPresetId,
    setSelectedPresetId
  ]);

  useEffect(() => {
    if (selectedModelId && !modelChoiceValues.includes(selectedModelId)) {
      setSelectedModelId(null);
    }
  }, [
    modelChoiceValues.join("|"),
    selectedModelId,
    setSelectedModelId
  ]);

  useEffect(() => {
    if (artifactOption.enabled) {
      return;
    }
    const nextOption = artifactOptions.find((option) => option.enabled);
    if (nextOption) {
      setOutputRecipeSetting("artifactFamily", nextOption.value);
    }
  }, [
    artifactOptions.map((option) => `${option.value}:${option.enabled}`).join("|"),
    artifactOption.enabled,
    setOutputRecipeSetting
  ]);

  useEffect(() => {
    const selectedAlpha = recipeControls.alphaModes.find((option) => option.value === outputRecipe.alphaMode);
    if (selectedAlpha?.enabled) {
      return;
    }
    const fallback = recipeControls.alphaModes.find((option) => option.enabled);
    if (fallback) {
      setOutputRecipeSetting("alphaMode", fallback.value);
    }
  }, [
    outputRecipe.alphaMode,
    recipeControls.alphaModes.map((option) => `${option.value}:${option.enabled}`).join("|"),
    setOutputRecipeSetting
  ]);

  useEffect(() => {
    const selectedColor = recipeControls.colorIntents.find((option) => option.value === outputRecipe.colorIntent);
    if (selectedColor?.enabled) {
      return;
    }
    const fallback = recipeControls.colorIntents.find((option) => option.enabled);
    if (fallback) {
      setOutputRecipeSetting("colorIntent", fallback.value);
    }
  }, [
    outputRecipe.colorIntent,
    recipeControls.colorIntents.map((option) => `${option.value}:${option.enabled}`).join("|"),
    setOutputRecipeSetting
  ]);

  useEffect(() => {
    if (!inputPath || outputPath) {
      return;
    }
    const suggestedOutput = suggestOutputPathForRecipe(
      inputPath,
      null,
      defaultOutputDir,
      outputRecipe,
      sourceContext,
      runtimeOutputRecipeCapabilities
    );
    if (suggestedOutput) {
      setOutput(suggestedOutput);
    }
  }, [
    inputPath,
    outputPath,
    defaultOutputDir,
    outputRecipe,
    sourceContext,
    runtimeOutputRecipeCapabilities,
    setOutput
  ]);

  useEffect(() => {
    if (!isProcessing) {
      setNowMs(Date.now());
      return;
    }

    const interval = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(interval);
  }, [isProcessing]);

  const telemetry = useMemo(() => jobTelemetrySummary({
    progressPercent: currentProgress,
    startedAtMs,
    finishedAtMs,
    nowMs,
    timings,
    metrics
  }), [currentProgress, finishedAtMs, metrics, nowMs, startedAtMs, timings]);
  const selectedPreset = selectedPresetId
    ? presetChoices.find((entry) => presetOptionValue(entry) === selectedPresetId)
    : null;
  const selectedModel = selectedModelId
    ? modelChoices.find((entry) => modelOptionValue(entry) === selectedModelId)
    : null;
  const recipeChips = useMemo(() => jobRecipeChips({
    presetLabel: selectedPreset ? presetOptionLabel(selectedPreset) : null,
    modelLabel: selectedModel ? modelOptionLabel(selectedModel) : null,
    videoEncodeMode,
    artifactPath,
    outputRecipe,
    advancedSettings
  }), [
    selectedPreset,
    selectedModel,
    videoEncodeMode,
    artifactPath,
    outputRecipe,
    advancedSettings
  ]);

  const handleSelectInput = async () => {
    await applySelectedInput(await selectSourceAsset("file"), "file");
  };

  const handleSelectInputFolder = async () => {
    await applySelectedInput(await selectSourceAsset("folder"), "folder");
  };

  const applySelectedInput = async (selected: string | null, mode: "file" | "folder") => {
    if (!selected) return;

    const nextSourceContext = { selectedAsFolder: mode === "folder" };
    const preferredArtifactFamily = preferredOutputArtifactFamily(
      selected,
      outputRecipe,
      nextSourceContext,
      runtimeOutputRecipeCapabilities
    );
    const nextRecipe = { ...outputRecipe, artifactFamily: preferredArtifactFamily };
    setInput(selected, mode);
    if (nextRecipe.artifactFamily !== outputRecipe.artifactFamily) {
      setOutputRecipeSetting("artifactFamily", nextRecipe.artifactFamily);
    }
    const suggestedOutput = suggestOutputPathForRecipe(
      selected,
      null,
      defaultOutputDir,
      nextRecipe,
      nextSourceContext,
      runtimeOutputRecipeCapabilities
    );
    if (suggestedOutput) {
      setOutput(suggestedOutput);
    }
  };

  const handleSelectHint = async () => {
    const selected = await selectAlphaHintAsset();
    if (selected) {
      setHint(selected);
    }
  };

  const handleClearHint = () => {
    setHint(null);
  };

  const handleSelectReplacementMedia = async () => {
    const selected = await selectSourceAsset("file");
    if (selected) {
      setOutputRecipeSetting("replacementMediaPath", selected);
    }
  };

  const handleClearReplacementMedia = () => {
    setOutputRecipeSetting("replacementMediaPath", null);
  };

  const handleSelectOutput = async () => {
    const defaultPath = outputReady
      ? outputPath || undefined
      : suggestOutputPathForRecipe(
          inputPath,
          null,
          defaultOutputDir,
          outputRecipe,
          sourceContext,
          runtimeOutputRecipeCapabilities
        ) || undefined;
    const selected = outputRecipe.artifactFamily === "movie"
      ? await save({
          defaultPath,
          filters: [{
            name: "Video",
            extensions: ["mov", "mkv", "avi", "mp4"]
          }]
        })
      : await open({
          directory: true,
          multiple: false,
          defaultPath
        });
    if (selected) {
      setOutput(Array.isArray(selected) ? selected[0] : selected);
    }
  };

  const handleRevealArtifact = async () => {
    const path = artifactPath || outputPath;
    if (!path) {
      return;
    }

    await invoke("reveal_in_folder", { path });
  };

  const handleResetWorkbench = () => {
    reset();
    setShowAdvanced(false);
    setShowLogs(false);
    setResetCount((value) => value + 1);
  };

  return (
    <div className="grid min-h-[calc(100vh-12rem)] grid-cols-1 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-5">
        <PreviewStage
          inputPath={inputPath}
          hintPath={hintPath}
          outputPath={outputPath}
          artifactPath={artifactPath}
          terminalStatus={terminalStatus}
          activeBackend={activeBackend}
          resetCount={resetCount}
          outputRecipe={outputRecipe}
        />

        <JobStatusPanel
          terminalStatus={terminalStatus}
          currentProgress={currentProgress}
          statusMessage={statusMessage}
          error={error}
          activeBackend={activeBackend}
          artifactPath={artifactPath}
          warnings={warnings}
          timings={timings}
          logs={logs}
          metrics={metrics}
          telemetry={telemetry}
          recipeChips={recipeChips}
          showLogs={showLogs}
          onRevealArtifact={handleRevealArtifact}
          onToggleLogs={() => setShowLogs(!showLogs)}
        />
      </div>

      <aside className="space-y-4">
        <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-apple">
          <PanelTitle icon={Clapperboard} label="Keying Inputs" />
          <div className="mt-4 space-y-3">
            <FileSlot
              icon={FileVideo}
              step="1"
              title="Source"
              value={fileName(inputPath)}
              placeholder="Select footage"
              onClick={handleSelectInput}
              active={Boolean(inputPath)}
              disabled={isProcessing}
            />
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleSelectInputFolder}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              <FolderDown className="h-4 w-4" />
              Select sequence or project folder
            </button>
            <FileSlot
              icon={Layers}
              step="2"
              title="Alpha Hint"
              value={fileName(hintPath)}
              placeholder="Select alpha hint"
              meta={hintModeLabel(hintPath)}
              onClick={handleSelectHint}
              active={Boolean(hintPath)}
              disabled={isProcessing}
            />
            {hintPath && (
              <button
                type="button"
                disabled={isProcessing}
                onClick={handleClearHint}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-bold text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Clear Alpha Hint
              </button>
            )}
            <FileSlot
              icon={FolderDown}
              step="3"
              title="Destination"
              value={outputReady ? fileName(outputPath) : ""}
              placeholder={outputPath ? "Choose output file" : "Choose where to save"}
              meta={outputReady ? outputRecipeLabel(outputRecipe) : "Needs destination"}
              onClick={handleSelectOutput}
              active={outputReady}
              disabled={isProcessing}
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-apple">
          <PanelTitle icon={FileImage} label="Output Recipe" />
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {artifactOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  disabled={isProcessing || !option.enabled}
                  onClick={() => setOutputRecipeSetting("artifactFamily", option.value)}
                  className={cn(
                    "min-h-12 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
                    outputRecipe.artifactFamily === option.value
                      ? "border-brand bg-brand/10 text-zinc-50"
                      : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700 hover:text-zinc-100"
                  )}
                >
                  <span className="block text-xs font-bold">{option.label}</span>
                  <span className="mt-1 block text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                    {artifactOptionStatusLabel(option.status)}
                  </span>
                </button>
              ))}
            </div>

            <AdvancedSelect
              label="Alpha"
              value={outputRecipe.alphaMode}
              options={recipeControls.alphaModes}
              disabled={isProcessing}
              onChange={(value) => setOutputRecipeSetting("alphaMode", value as OutputAlphaMode)}
            />

            <AdvancedSelect
              label="Preview background"
              value={outputRecipe.previewBackground}
              options={recipeControls.previewBackgrounds}
              disabled={isProcessing}
              onChange={(value) => setOutputRecipeSetting("previewBackground", value as PreviewBackgroundMode)}
            />

            {outputRecipe.previewBackground === "solid" && (
              <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300">
                <span>Preview color</span>
                <input
                  aria-label="Preview color"
                  type="color"
                  value={outputRecipe.previewSolidColor}
                  disabled={isProcessing}
                  onChange={(event) => setOutputRecipeSetting("previewSolidColor", event.target.value)}
                  className="h-8 w-12 rounded border border-zinc-800 bg-zinc-950 disabled:opacity-50"
                />
              </label>
            )}

            {outputRecipe.previewBackground === "replacement_media" && (
              <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                  Replacement media
                </div>
                <div className="truncate text-xs font-medium text-zinc-300">
                  {outputRecipe.replacementMediaPath
                    ? `Replacement media selected: ${fileName(outputRecipe.replacementMediaPath)}`
                    : "No replacement media selected"}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleSelectReplacementMedia}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Select replacement media
                  </button>
                  <button
                    type="button"
                    disabled={isProcessing || !outputRecipe.replacementMediaPath}
                    onClick={handleClearReplacementMedia}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Clear replacement
                  </button>
                </div>
              </div>
            )}

            <AdvancedSelect
              label="Color intent"
              value={outputRecipe.colorIntent}
              options={recipeControls.colorIntents}
              disabled={isProcessing}
              onChange={(value) => setOutputRecipeSetting("colorIntent", value as OutputColorIntent)}
            />
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-apple">
          <PanelTitle icon={SlidersHorizontal} label="Quality" />
          <div className="mt-4 space-y-4">
            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Preset</span>
              <select
                value={selectedPresetId ?? ""}
                disabled={isProcessing || !runtimeUsable || presetChoices.length === 0}
                onChange={(event) => setSelectedPresetId(event.target.value || null)}
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition-colors focus:border-brand disabled:opacity-50"
              >
                {presetChoices.length === 0 ? (
                  <option value="">{presetUnavailableLabel(readiness)}</option>
                ) : (
                  presetChoices.map((preset) => (
                    <option key={presetOptionValue(preset)} value={presetOptionValue(preset)}>
                      {presetOptionLabel(preset)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <label className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Model</span>
              <select
                value={selectedModelId ?? ""}
                disabled={isProcessing || !runtimeUsable}
                onChange={(event) => setSelectedModelId(event.target.value || null)}
                className="h-10 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-50 outline-none transition-colors focus:border-brand disabled:opacity-50"
              >
                <option value="">Runtime preset default</option>
                {modelChoices.length === 0 ? (
                  <option value="" disabled>{modelUnavailableLabel(readiness)}</option>
                ) : (
                  modelChoices.map((model) => (
                    <option key={modelOptionValue(model)} value={modelOptionValue(model)}>
                      {modelOptionLabel(model)}
                    </option>
                  ))
                )}
              </select>
            </label>

            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Encoding</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
                {(["balanced", "lossless"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    disabled={isProcessing}
                    onClick={() => setVideoEncodeMode(mode)}
                    className={cn(
                      "h-8 rounded-md px-4 text-xs font-bold uppercase transition-colors disabled:opacity-50",
                      videoEncodeMode === mode
                        ? "bg-brand text-white"
                        : "text-zinc-400 hover:text-zinc-100"
                    )}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <QualityStat label="Preset" value={selectedPreset ? presetOptionLabel(selectedPreset) : "Default"} />
              <QualityStat label="Model" value={selectedModel ? modelOptionLabel(selectedModel) : "Auto"} />
            </div>

            <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
              <button
                type="button"
                aria-expanded={showAdvanced}
                onClick={() => setShowAdvanced((value) => !value)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors hover:bg-zinc-900"
              >
                <span>
                  <span className="block text-sm font-bold text-zinc-100">Advanced controls</span>
                  <span className="mt-0.5 block text-xs text-zinc-500">Runtime-backed process options</span>
                </span>
                <ChevronRight className={cn("h-4 w-4 text-zinc-500 transition-transform", showAdvanced && "rotate-90")} />
              </button>

              {showAdvanced && (
                <div className="space-y-4 border-t border-zinc-800 p-3">
                  <AdvancedGroup title="Screen color">
                    <AdvancedInfo
                      label="Active screen color"
                      value={screenColorLabel(selectedModel ?? null)}
                    />
                    <AdvancedInfo
                      label="Selection policy"
                      value={selectedModel ? "Explicit model" : "Runtime preset"}
                    />
                  </AdvancedGroup>

                  <AdvancedGroup title="Quality">
                    <AdvancedSelect
                      label="Quality fallback"
                      value={advancedSettings.qualityFallback}
                      options={QUALITY_FALLBACK_OPTIONS}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("qualityFallback", value as QualityFallbackMode)}
                    />
                    <AdvancedSelect
                      label="Precision"
                      value={advancedSettings.precision}
                      options={PRECISION_OPTIONS}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("precision", value as PrecisionMode)}
                    />
                    <AdvancedSelect
                      label="Resolution"
                      value={advancedSettings.resolution}
                      options={RESOLUTION_OPTIONS}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("resolution", Number(value) as RuntimeResolution)}
                    />
                    <AdvancedNumber
                      label="Batch size"
                      value={advancedSettings.batchSize}
                      min={1}
                      max={64}
                      step={1}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("batchSize", value)}
                    />
                  </AdvancedGroup>

                  <AdvancedGroup title="Alpha hint">
                    <AdvancedInfo
                      label="Hint mode"
                      value={hintPath ? "External alpha hint" : "Runtime rough-matte fallback"}
                    />
                    <AdvancedInfo
                      label="Hint source"
                      value={hintPath ? fileName(hintPath) : "No hint selected"}
                    />
                  </AdvancedGroup>

                  <AdvancedGroup title="Despill">
                    <AdvancedNumber
                      label="Despill"
                      value={advancedSettings.despill}
                      min={0}
                      max={1}
                      step={0.05}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("despill", value)}
                    />
                    <AdvancedCheckbox
                      label="Despeckle cleanup"
                      checked={advancedSettings.despeckle}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("despeckle", value)}
                    />
                  </AdvancedGroup>

                  <AdvancedGroup title="Output mode">
                    <AdvancedInfo label="Artifact family" value={outputRecipeLabel(outputRecipe)} />
                    <AdvancedInfo label="Alpha output" value={displayModeLabel(outputRecipe.alphaMode)} />
                    <AdvancedInfo label="Preview background" value={displayModeLabel(outputRecipe.previewBackground)} />
                    <AdvancedInfo label="Color intent" value={displayModeLabel(outputRecipe.colorIntent)} />
                  </AdvancedGroup>

                  <AdvancedGroup title="Tiling and refinement">
                    <AdvancedSelect
                      label="Refinement mode"
                      value={advancedSettings.refinementMode}
                      options={REFINEMENT_MODE_OPTIONS}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("refinementMode", value as RefinementMode)}
                    />
                    <AdvancedCheckbox
                      label="Force tiled processing"
                      checked={advancedSettings.tiled}
                      disabled={isProcessing}
                      onChange={(value) => setAdvancedSetting("tiled", value)}
                    />
                  </AdvancedGroup>

                  <AdvancedGroup title="Runtime diagnostics">
                    <AdvancedInfo label="Readiness" value={readiness ? readinessLabel(readiness.status) : "Probe pending"} />
                    <AdvancedInfo label="Runtime path" value={readiness?.runtime_path ? fileName(readiness.runtime_path) : "Not resolved"} />
                  </AdvancedGroup>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-apple">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-zinc-50">{statusTitle(terminalStatus, Boolean(error), currentProgress)}</div>
              <div className={cn("mt-1 text-xs", error ? "text-destructive" : "text-zinc-400")}>
                {statusMessage}
              </div>
            </div>
            <RuntimeDot readiness={readiness} />
          </div>

          <div className="mt-4">
            {isProcessing ? (
              <Button
                size="lg"
                variant="destructive"
                onClick={cancelJob}
                className="w-full gap-2"
              >
                <Square className="h-4 w-4" />
                Cancel
              </Button>
            ) : (
              <Button
                size="lg"
                disabled={!canStart}
                onClick={startJob}
                className="w-full gap-2"
              >
                {canRetry ? (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Retry
                  </>
                ) : (
                  <>
                    <PlayCircle className="h-4 w-4" />
                    Run Neural Keyer
                    <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </>
                )}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={isProcessing}
              onClick={handleResetWorkbench}
              className="mt-2 w-full gap-2 text-zinc-400 hover:text-zinc-100"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Workbench
            </Button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function PreviewStage({
  inputPath,
  hintPath,
  outputPath,
  artifactPath,
  terminalStatus,
  activeBackend,
  resetCount,
  outputRecipe
}: {
  inputPath: string | null;
  hintPath: string | null;
  outputPath: string | null;
  artifactPath: string | null;
  terminalStatus: string;
  activeBackend: string | null;
  resetCount: number;
  outputRecipe: OutputRecipeSettings;
}) {
  const [activePreview, setActivePreview] = useState<PreviewMode>("source");
  const [comparisonMode, setComparisonMode] = useState<ViewerComparisonMode>("single");
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const previewItems: PreviewItem[] = [
    {
      id: "source",
      label: "Source",
      badge: "Input",
      path: inputPath,
      icon: FileVideo,
      emptyTitle: "No source selected",
      emptySubtitle: "Select footage"
    },
    {
      id: "hint",
      label: "Alpha Hint",
      badge: "Matte",
      path: hintPath,
      icon: Layers,
      emptyTitle: "No alpha hint",
      emptySubtitle: "Optional"
    },
    {
      id: "result",
      label: "Result",
      badge: "Output",
      path: artifactPath,
      pendingPath: outputPath,
      icon: FolderDown,
      emptyTitle: "Result pending",
      emptySubtitle: outputPath ? fileName(outputPath) : "Choose output file"
    }
  ];
  const activeItem = previewItems.find((item) => item.id === activePreview) ?? previewItems[0];
  const comparisonState = resolveComparisonState(previewItems, activePreview, comparisonMode);
  const primaryItem = previewItems.find((item) => item.id === comparisonState.primary?.id) ?? previewItems[0];
  const secondaryItem = previewItems.find((item) => item.id === comparisonState.secondary?.id) ?? activeItem;

  useEffect(() => {
    if (artifactPath) {
      setActivePreview("result");
    }
  }, [artifactPath]);

  useEffect(() => {
    setActivePreview("source");
    setComparisonMode("single");
    setComparisonPosition(50);
  }, [resetCount]);

  return (
    <section className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-apple">
      <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Activity className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-zinc-50">Keying Workbench</div>
            <div className="text-[11px] font-medium text-zinc-500">
              {activeBackend || readinessStatusLabel(terminalStatus)}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            {previewItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActivePreview(item.id)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-bold transition-colors",
                  activePreview === item.id
                    ? "bg-brand text-white"
                    : "text-zinc-400 hover:text-zinc-100"
                )}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 xl:grid-cols-6">
            {COMPARISON_MODES.map((mode) => (
              <button
                key={mode.id}
                type="button"
                disabled={mode.id !== "single" && !comparisonState.canCompare}
                onClick={() => setComparisonMode(mode.id)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  comparisonMode === mode.id
                    ? "bg-brand text-white"
                    : "text-zinc-400 hover:text-zinc-100"
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative bg-black">
        {comparisonState.canCompare && comparisonState.mode !== "single" ? (
          <ComparisonSurface
            mode={comparisonState.mode}
            position={comparisonPosition}
            primary={primaryItem}
            secondary={secondaryItem}
            title={comparisonState.title}
            outputRecipe={outputRecipe}
            onPositionChange={setComparisonPosition}
          />
        ) : (
          <PreviewSurface item={activeItem} outputRecipe={outputRecipe} />
        )}
      </div>
    </section>
  );
}

const COMPARISON_MODES: Array<{ id: ViewerComparisonMode; label: string }> = [
  { id: "single", label: "Single" },
  { id: "vertical", label: "Vertical" },
  { id: "horizontal", label: "Horizontal" },
  { id: "diagonal", label: "Diagonal" },
  { id: "overlay", label: "Overlay" },
  { id: "difference", label: "Difference" }
];

function ComparisonSurface({
  mode,
  position,
  primary,
  secondary,
  title,
  outputRecipe,
  onPositionChange
}: {
  mode: ViewerComparisonMode;
  position: number;
  primary: PreviewItem;
  secondary: PreviewItem;
  title: string;
  outputRecipe: OutputRecipeSettings;
  onPositionChange: (position: number) => void;
}) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const primaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement | null>(null);
  const isApplyingSyncRef = useRef(false);
  const clipped = mode === "vertical" || mode === "horizontal" || mode === "diagonal";
  const adjustable = clipped || mode === "overlay";
  const syncFrom = useCallback((role: PreviewSyncRole) => {
    if (isApplyingSyncRef.current) {
      return;
    }

    const anchor = role === "primary" ? primaryVideoRef.current : secondaryVideoRef.current;
    const follower = role === "primary" ? secondaryVideoRef.current : primaryVideoRef.current;
    if (!anchor || !follower) {
      return;
    }

    const action = mediaSyncAction(
      readMediaSnapshot(anchor),
      readMediaSnapshot(follower)
    );
    if (
      action.currentTime === null &&
      action.paused === null &&
      action.playbackRate === null
    ) {
      return;
    }

    isApplyingSyncRef.current = true;
    if (action.playbackRate !== null) {
      follower.playbackRate = action.playbackRate;
    }
    if (action.currentTime !== null) {
      follower.currentTime = action.currentTime;
    }
    if (action.paused !== null) {
      if (action.paused) {
        follower.pause();
      } else {
        void follower.play().catch(() => undefined);
      }
    }
    window.setTimeout(() => {
      isApplyingSyncRef.current = false;
    }, 0);
  }, []);
  const registerVideo = useCallback((
    role: PreviewSyncRole,
    element: HTMLVideoElement | null
  ) => {
    if (role === "primary") {
      primaryVideoRef.current = element;
    } else {
      secondaryVideoRef.current = element;
    }
    if (element) {
      window.requestAnimationFrame(() => syncFrom("primary"));
    }
  }, [syncFrom]);
  const overlayStyle = {
    ...comparisonClipStyle(mode, position),
    opacity: mode === "overlay" ? Math.max(0.05, Math.min(1, position / 100)) : 1,
    mixBlendMode: mode === "difference" ? "difference" as const : "normal" as const
  };
  const updatePositionFromPointer = (clientX: number, clientY: number) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      return;
    }
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    onPositionChange(comparisonPositionFromPoint(mode, x, y));
  };

  return (
    <div
      ref={surfaceRef}
      className={cn(
        "relative aspect-video min-h-72 overflow-hidden bg-black",
        clipped && "cursor-crosshair"
      )}
      onPointerDown={(event) => {
        if (!clipped) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePositionFromPointer(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!clipped || event.buttons !== 1) return;
        updatePositionFromPointer(event.clientX, event.clientY);
      }}
    >
      <div className="absolute inset-0">
        <PreviewSurface
          item={secondary}
          outputRecipe={outputRecipe}
          fill
          videoSync={{ role: "secondary", register: registerVideo, syncFrom }}
        />
      </div>
      <div className="absolute inset-0" style={overlayStyle}>
        <PreviewSurface
          item={primary}
          outputRecipe={outputRecipe}
          fill
          videoSync={{ role: "primary", register: registerVideo, syncFrom }}
        />
      </div>
      {clipped && <ComparisonDivider mode={mode} position={position} />}
      <div className="pointer-events-none absolute left-4 top-4 rounded bg-zinc-950/85 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-300">
        {title} - Synced playback
      </div>
      <div
        className="absolute bottom-4 left-4 right-4 flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/85 px-3 py-2 backdrop-blur-xl"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-500">{Math.round(position)}%</span>
        <input
          aria-label={mode === "overlay" ? "Overlay opacity" : "Wipe position"}
          type="range"
          min="0"
          max="100"
          value={position}
          onChange={(event) => onPositionChange(Number(event.target.value))}
          className="w-full accent-brand"
          disabled={!adjustable}
        />
      </div>
    </div>
  );
}

function ComparisonDivider({
  mode,
  position
}: {
  mode: ViewerComparisonMode;
  position: number;
}) {
  const geometry = comparisonDividerGeometry(mode, position);

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible drop-shadow-[0_0_8px_rgba(14,165,233,0.55)]"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
    >
      <line
        x1={geometry.x1}
        y1={geometry.y1}
        x2={geometry.x2}
        y2={geometry.y2}
        vectorEffect="non-scaling-stroke"
        className="stroke-brand"
        strokeWidth="0.35"
      />
    </svg>
  );
}

function PreviewSurface({
  item,
  outputRecipe,
  fill = false,
  videoSync
}: {
  item: PreviewItem;
  outputRecipe: OutputRecipeSettings;
  fill?: boolean;
  videoSync?: PreviewVideoSync;
}) {
  const [proxyPath, setProxyPath] = useState<string | null>(null);
  const [isCreatingProxy, setIsCreatingProxy] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const previewBackground = previewBackgroundStyle(outputRecipe);

  useEffect(() => {
    requestIdRef.current += 1;
    setProxyPath(null);
    setIsCreatingProxy(false);
    setPreviewError(null);
  }, [item.path]);

  if (!item.path) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_center,#18181b_0,#09090b_56%)] px-6 text-center",
        fill ? "h-full w-full" : "aspect-video min-h-72"
      )}>
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-950 text-zinc-500 shadow-apple">
          <item.icon className="h-7 w-7" />
        </div>
        <div>
          <div className="text-lg font-bold text-zinc-100">{item.emptyTitle}</div>
          <div className="mt-1 text-sm text-zinc-500">{item.emptySubtitle}</div>
        </div>
      </div>
    );
  }

  const previewKind = previewKindForPath(item.path);
  const previewPath = proxyPath || item.path;
  const src = toAssetUrl(previewPath);
  const usingProxy = Boolean(proxyPath);

  const handleVideoError = () => {
    if (proxyPath || isCreatingProxy) {
      setPreviewError(
        proxyPath
          ? "Preview proxy could not be loaded."
          : "Preview could not be loaded."
      );
      return;
    }

    const requestedPath = item.path;
    if (!requestedPath) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsCreatingProxy(true);
    setPreviewError(null);
    createPreviewProxy(requestedPath)
      .then((proxy) => {
        if (requestIdRef.current !== requestId) return;
        setProxyPath(proxy.path);
      })
      .catch((error) => {
        if (requestIdRef.current !== requestId) return;
        setPreviewError(formatPreviewError(error));
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setIsCreatingProxy(false);
      });
  };

  if (isCreatingProxy) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center",
        fill ? "h-full w-full" : "aspect-video min-h-72"
      )}>
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-900 text-brand">
          <Zap className="h-7 w-7 animate-pulse" />
        </div>
        <div>
          <div className="text-lg font-bold text-zinc-100">Preparing preview</div>
          <div className="mt-1 text-sm text-zinc-500">Creating a browser-friendly proxy</div>
        </div>
      </div>
    );
  }

  if (previewError) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center",
        fill ? "h-full w-full" : "aspect-video min-h-72"
      )}>
        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <div>
          <div className="text-lg font-bold text-zinc-100">Preview unavailable</div>
          <div className="mt-1 max-w-xl text-sm text-zinc-500">
            {previewError}
          </div>
        </div>
      </div>
    );
  }

  if (previewKind === "image") {
    return (
      <div
        className={cn(previewBackground.className, fill ? "h-full w-full" : "aspect-video min-h-72")}
        style={previewBackground.style}
      >
        <img
          src={src}
          alt={`${item.label} preview`}
          className="h-full w-full object-contain"
        />
      </div>
    );
  }

  if (previewKind === "video") {
    return (
      <div
        className={cn("relative", previewBackground.className, fill ? "h-full w-full" : "aspect-video min-h-72")}
        style={previewBackground.style}
      >
        <video
          key={`${item.id}-${previewPath}`}
          ref={(element) => videoSync?.register(videoSync.role, element)}
          src={src}
          data-preview-sync-role={videoSync?.role}
          className="h-full w-full bg-black object-contain"
          controls={!fill}
          muted
          autoPlay={fill}
          loop={fill}
          playsInline
          preload="metadata"
          onError={handleVideoError}
          onLoadedMetadata={() => {
            setPreviewError(null);
            videoSync?.syncFrom(videoSync.role);
          }}
          onPlay={() => videoSync?.syncFrom(videoSync.role)}
          onPause={() => videoSync?.syncFrom(videoSync.role)}
          onRateChange={() => videoSync?.syncFrom(videoSync.role)}
          onSeeked={() => videoSync?.syncFrom(videoSync.role)}
          onTimeUpdate={() => videoSync?.syncFrom(videoSync.role)}
        />
        {usingProxy && (
          <div className="pointer-events-none absolute left-4 top-4 rounded bg-zinc-950/80 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
            Preview proxy
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center",
      fill ? "h-full w-full" : "aspect-video min-h-72"
    )}>
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-zinc-900 text-zinc-500">
        <FileImage className="h-7 w-7" />
      </div>
      <div>
        <div className="text-lg font-bold text-zinc-100">{fileName(item.path)}</div>
        <div className="mt-1 text-sm text-zinc-500">Preview unavailable for {fileExtension(item.path).toUpperCase() || "this format"}</div>
      </div>
    </div>
  );
}

function readMediaSnapshot(video: HTMLVideoElement) {
  return {
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    playbackRate: video.playbackRate
  };
}

function JobStatusPanel({
  terminalStatus,
  currentProgress,
  statusMessage,
  error,
  activeBackend,
  artifactPath,
  warnings,
  timings,
  logs,
  metrics,
  telemetry,
  recipeChips,
  showLogs,
  onRevealArtifact,
  onToggleLogs
}: {
  terminalStatus: string;
  currentProgress: number;
  statusMessage: string;
  error: string | null;
  activeBackend: string | null;
  artifactPath: string | null;
  warnings: string[];
  timings: Array<{ name?: string; total_ms?: number; sample_count?: number }> | undefined;
  logs: string[];
  metrics: JobMetrics;
  telemetry: JobTelemetrySummary;
  recipeChips: string[];
  showLogs: boolean;
  onRevealArtifact: () => void;
  onToggleLogs: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const Icon = error || terminalStatus === "failed"
    ? AlertCircle
    : terminalStatus === "completed" || currentProgress === 100
      ? CheckCircle2
      : terminalStatus === "cancelled"
        ? Square
        : Zap;
  const diagnosticSummary = useMemo(() => buildDiagnosticSummary({
    status: terminalStatus,
    statusMessage,
    backend: activeBackend,
    artifactPath,
    error,
    warnings,
    metrics,
    timings,
    logs
  }), [
    terminalStatus,
    statusMessage,
    activeBackend,
    artifactPath,
    error,
    warnings,
    metrics,
    timings,
    logs
  ]);

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticSummary);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-apple">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            error || terminalStatus === "failed"
              ? "bg-destructive/10 text-destructive"
              : terminalStatus === "completed" || currentProgress === 100
                ? "bg-brand/10 text-brand"
                : "bg-zinc-900 text-zinc-400"
          )}>
            <Icon className={cn("h-5 w-5", terminalStatus === "running" && "animate-pulse")} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-zinc-50">
              {statusTitle(terminalStatus, Boolean(error), currentProgress)}
            </div>
            <div className={cn("mt-1 break-words text-xs", error ? "text-destructive" : "text-zinc-400")}>
              {statusMessage}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {activeBackend && <StatusPill label={activeBackend} />}
          <StatusPill label={`Elapsed ${telemetry.elapsedLabel}`} />
          {telemetry.etaLabel !== "n/a" && <StatusPill label={`ETA ${telemetry.etaLabel}`} />}
          {telemetry.stageLabel !== "n/a" && <StatusPill label={`Stage ${telemetry.stageLabel}`} />}
          {telemetry.frameLabel !== "n/a" && <StatusPill label={telemetry.frameLabel} />}
          {telemetry.fpsLabel !== "n/a" && <StatusPill label={`Render ${telemetry.fpsLabel}`} />}
          {telemetry.decodeFpsLabel !== "n/a" && <StatusPill label={telemetry.decodeFpsLabel} />}
          {telemetry.encodeFpsLabel !== "n/a" && <StatusPill label={telemetry.encodeFpsLabel} />}
          {telemetry.workerLabel !== "n/a" && <StatusPill label={telemetry.workerLabel} />}
          {telemetry.stageCount > 0 && <StatusPill label={`${telemetry.stageCount} stages`} />}
          {recipeChips.slice(0, 16).map((chip) => (
            <StatusPill key={chip} label={chip} />
          ))}
          {metrics.ram_usage_mb && <StatusPill label={`${metrics.ram_usage_mb}MB RAM`} />}
          {metrics.cpu_usage_percent !== undefined && <StatusPill label={`${metrics.cpu_usage_percent.toFixed(1)}% CPU`} />}
          {metrics.vram_usage_mb && <StatusPill label={`${metrics.vram_usage_mb}MB VRAM`} />}
          <StatusPill label={`${Math.round(currentProgress)}%`} />
        </div>
      </div>

      {!error && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full bg-brand transition-all duration-500 ease-out"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mt-4 max-h-32 overflow-auto rounded-lg border border-destructive/15 bg-destructive/5 p-3 font-mono text-xs text-destructive">
          {error}
        </div>
      )}

      {artifactPath && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
          <span className="font-bold text-zinc-100">Artifact:</span> {artifactPath}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
              {warning}
            </div>
          ))}
        </div>
      )}

      {timings && timings.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          {timings.slice(0, 3).map((timing, index) => (
            <div key={`${timing.name || "stage"}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <div className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {timing.name || "Stage"}
              </div>
              <div className="font-mono text-sm text-zinc-100">
                {formatTiming(timing.total_ms)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onToggleLogs}
          className="flex items-center gap-2 text-[10px] text-zinc-500 transition-colors hover:text-zinc-100"
        >
          <Terminal className="h-3 w-3" />
          {showLogs ? "Hide Technical Logs" : "View Technical Logs"}
        </button>
        <button
          type="button"
          onClick={handleCopyDiagnostics}
          className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Copy className="h-3 w-3" />
          {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy Failed" : "Copy Diagnostics"}
        </button>
        {artifactPath && (
          <button
            type="button"
            onClick={onRevealArtifact}
            className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <FolderDown className="h-3 w-3" />
            Reveal Output
          </button>
        )}
      </div>

      {showLogs && (
        <div className="mt-4 max-h-48 overflow-auto rounded-lg bg-black/90 p-4 font-mono text-[10px] text-brand/80 whitespace-pre-wrap">
          {logs.length > 0 ? logs.join("\n") : "Waiting for engine output..."}
        </div>
      )}
    </section>
  );
}

function FileSlot({
  icon: Icon,
  step,
  title,
  value,
  placeholder,
  meta,
  onClick,
  active,
  disabled
}: {
  icon: typeof FileVideo;
  step: string;
  title: string;
  value: string;
  placeholder: string;
  meta?: string;
  onClick: () => void;
  active: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-brand/50 bg-brand/10"
          : "border-zinc-800 bg-zinc-900/60 hover:border-brand/40 hover:bg-brand/5"
      )}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-brand">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-zinc-100">{step}. {title}</div>
          {meta && (
            <div className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-zinc-500">
              {meta}
            </div>
          )}
        </div>
        <div className="mt-1 truncate text-xs text-zinc-500">{value || placeholder}</div>
      </div>
    </button>
  );
}

function PanelTitle({ icon: Icon, label }: { icon: typeof FileVideo; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-brand" />
      <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">{label}</h3>
    </div>
  );
}

function QualityStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-xs font-medium text-zinc-200">{value}</div>
    </div>
  );
}

function AdvancedGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{title}</div>
      <div className="grid grid-cols-1 gap-3">
        {children}
      </div>
    </div>
  );
}

function AdvancedInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-xs font-medium text-zinc-200">{value}</div>
    </div>
  );
}

function AdvancedSelect({
  label,
  value,
  options,
  disabled,
  onChange
}: {
  label: string;
  value: string | number;
  options: Array<{ value: string | number; label: string; enabled?: boolean; status?: string }>;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-100 outline-none transition-colors focus:border-brand disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.enabled === false}>
            {controlOptionLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}

function controlOptionLabel(option: { label: string; status?: string }) {
  if (option.status === "awaiting_runtime_contract") {
    return `${option.label} (needs runtime support)`;
  }
  if (option.status === "preview_only") {
    return `${option.label} (preview only)`;
  }
  return option.label;
}

function AdvancedNumber({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="space-y-1.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-100 outline-none transition-colors focus:border-brand disabled:opacity-50"
      />
    </label>
  );
}

function AdvancedCheckbox({
  label,
  checked,
  disabled,
  onChange
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-brand disabled:opacity-50"
      />
    </label>
  );
}

function RuntimeDot({ readiness }: { readiness: RuntimeReadiness | null }) {
  const color = readiness?.status === "ready"
    ? "bg-brand"
    : readiness?.status === "degraded"
      ? "bg-zinc-500"
      : "bg-destructive";
  const label = readiness ? readinessLabel(readiness.status) : "Runtime probe pending";

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <div className="rounded bg-zinc-900 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
      {label}
    </div>
  );
}

function presetOptionValue(entry: RuntimeCatalogEntry): string {
  return stringField(entry.id) || stringField(entry.name) || "";
}

function presetOptionLabel(entry: RuntimeCatalogEntry): string {
  return stringField(entry.name) || stringField(entry.id) || "Runtime preset";
}

function modelOptionValue(entry: RuntimeCatalogEntry): string {
  return stringField(entry.path) || stringField(entry.filename) || stringField(entry.id) || stringField(entry.name) || "";
}

function modelOptionLabel(entry: RuntimeCatalogEntry): string {
  const name = stringField(entry.filename) || stringField(entry.name) || "Runtime model";
  const resolution = numberField(entry.resolution);
  const state = stringField(entry.artifact_state?.state);
  return [
    name,
    resolution > 0 ? `${resolution}px` : "",
    state
  ].filter(Boolean).join(" - ");
}

function artifactOptionStatusLabel(status: string): string {
  if (status === "needs_image_source") return "Image source";
  if (status === "needs_video_source") return "Video source";
  if (status === "awaiting_runtime_contract") return "Needs runtime support";
  return "Supported";
}

function screenColorLabel(model: RuntimeCatalogEntry | null): string {
  const screenColor = stringField(model?.screen_color);
  if (!screenColor) return "Runtime preset";
  return displayModeLabel(screenColor);
}

function displayModeLabel(value: string): string {
  return value
    .split("_")
    .map((part, index) => index === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part)
    .join(" ");
}

function hintModeLabel(hintPath: string | null): string {
  return hintPath ? "External hint" : "Runtime fallback";
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberField(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function presetUnavailableLabel(readiness: RuntimeReadiness | null): string {
  if (!readiness) return "Runtime catalog loading";
  if (readiness.status === "error") return "Runtime unavailable";
  if (!readiness.presets.ok) return "Preset probe failed";
  return "No compatible presets";
}

function modelUnavailableLabel(readiness: RuntimeReadiness | null): string {
  if (!readiness) return "Runtime models loading";
  if (readiness.status === "error") return "Runtime unavailable";
  if (!readiness.models.ok) return "Model probe failed";
  return "No compatible models";
}

function statusTitle(status: string, hasError: boolean, progress: number): string {
  if (hasError || status === "failed") return "Processing Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed" || progress === 100) return "Complete";
  if (status === "running") return "In Progress";
  return "Ready";
}

function readinessStatusLabel(status: string): string {
  if (status === "running") return "Runtime active";
  if (status === "completed") return "Artifact ready";
  if (status === "failed") return "Runtime failed";
  if (status === "cancelled") return "Runtime cancelled";
  return "Runtime idle";
}

function readinessLabel(status: string) {
  if (status === "ready") return "Runtime ready";
  if (status === "degraded") return "Runtime usable";
  return "Runtime error";
}

function formatTiming(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value.toFixed(1)}ms`;
}

function toAssetUrl(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}
