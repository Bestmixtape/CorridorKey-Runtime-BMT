import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useJobStore } from "@/lib/job";
import { useEngineStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  Clapperboard,
  FileImage,
  FileVideo,
  FolderDown,
  Layers,
  PlayCircle,
  RotateCcw,
  SlidersHorizontal,
  Square
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { RuntimeCatalogEntry, RuntimeReadiness } from "@/lib/engine";
import {
  fileName,
} from "@/lib/media";
import { selectAlphaHintAsset, selectSourceAsset } from "@/lib/preview";
import { jobTelemetrySummary } from "@/lib/jobTelemetry";
import { jobStatusTitle } from "@/lib/jobStatus";
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
  suggestOutputPathForRecipe,
  type OutputAlphaMode,
  type OutputColorIntent,
  type OutputRecipeSettings,
  type PreviewBackgroundMode
} from "@/lib/outputRecipe";
import { jobRecipeChips } from "@/lib/jobRecipe";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";
import { WorkbenchViewer } from "@/components/workflow/WorkbenchViewer";

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
  const artifactMetadata = useMemo(() => ({
    output_recipe: outputRecipeLabel(outputRecipe),
    artifact_family: outputRecipe.artifactFamily,
    alpha_mode: outputRecipe.alphaMode,
    preview_background: outputRecipe.previewBackground,
    color_intent: outputRecipe.colorIntent,
    video_encode: videoEncodeMode,
    output_path: artifactPath || outputPath || ""
  }), [
    artifactPath,
    outputPath,
    outputRecipe,
    videoEncodeMode
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
        <WorkbenchViewer
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
          artifactMetadata={artifactMetadata}
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
              <div className="text-sm font-bold text-zinc-50">{jobStatusTitle(terminalStatus, Boolean(error), currentProgress)}</div>
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

function readinessLabel(status: string) {
  if (status === "ready") return "Runtime ready";
  if (status === "degraded") return "Runtime usable";
  return "Runtime error";
}
