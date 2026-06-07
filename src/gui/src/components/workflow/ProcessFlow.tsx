import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { loadSelectedPresetPreference, useJobStore } from "@/lib/job";
import { useEngineStore } from "@/lib/store";
import { useEffect, useMemo, useState } from "react";
import { selectAlphaHintAsset, selectSourceAsset } from "@/lib/preview";
import { preferredPresetId } from "@/lib/catalog";
import { jobTelemetrySummary } from "@/lib/jobTelemetry";
import {
  isOutputPathReady,
  outputArtifactOptions,
  preferredOutputArtifactFamily,
  outputRecipeControlOptions,
  outputRecipeLabel,
  suggestOutputPathForRecipe,
} from "@/lib/outputRecipe";
import { jobRecipeChips } from "@/lib/jobRecipe";
import {
  modelOptionLabel,
  modelOptionValue,
  presetOptionLabel,
  presetOptionValue
} from "@/lib/workflowLabels";
import { JobStatusPanel } from "@/components/workflow/JobStatusPanel";
import { WorkbenchViewer } from "@/components/workflow/WorkbenchViewer";
import { WorkflowSetupRail } from "@/components/workflow/WorkflowSetupRail";

export function ProcessFlow() {
  const {
    inputPath, inputSourceMode, setInput,
    outputPath, setOutput,
    hintPath, setHint,
    selectedModelId, setSelectedModelId,
    selectedPresetId, setSelectedPresetId, restoreSelectedPresetId,
    videoEncodeMode, setVideoEncodeMode,
    outputRecipe, setOutputRecipeSetting,
    advancedSettings, setAdvancedSetting,
    defaultOutputDir,
    startJob, cancelJob, isProcessing,
    terminalStatus,
    currentProgress, statusMessage,
    startedAtMs, finishedAtMs,
    error, activeBackend,
    artifactPath, previewArtifactPath, warnings,
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
  const viewerArtifactPath = previewArtifactPath || artifactPath;

  const [showLogs, setShowLogs] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [resetCount, setResetCount] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const preferredId = preferredPresetId(
      presetChoices,
      selectedPresetId ?? loadSelectedPresetPreference()
    );
    if (preferredId !== selectedPresetId) {
      restoreSelectedPresetId(preferredId);
    }
  }, [
    presetChoiceValues.join("|"),
    selectedPresetId,
    presetChoices,
    restoreSelectedPresetId
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
    ? presetChoices.find((entry) => presetOptionValue(entry) === selectedPresetId) ?? null
    : null;
  const selectedModel = selectedModelId
    ? modelChoices.find((entry) => modelOptionValue(entry) === selectedModelId) ?? null
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
          artifactPath={viewerArtifactPath}
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

      <WorkflowSetupRail
        inputPath={inputPath}
        hintPath={hintPath}
        outputPath={outputPath}
        outputReady={outputReady}
        outputRecipe={outputRecipe}
        artifactOptions={artifactOptions}
        recipeControls={recipeControls}
        isProcessing={isProcessing}
        runtimeUsable={runtimeUsable}
        presetChoices={presetChoices}
        modelChoices={modelChoices}
        selectedPresetId={selectedPresetId}
        selectedModelId={selectedModelId}
        selectedPreset={selectedPreset}
        selectedModel={selectedModel}
        videoEncodeMode={videoEncodeMode}
        advancedSettings={advancedSettings}
        showAdvanced={showAdvanced}
        readiness={readiness}
        terminalStatus={terminalStatus}
        currentProgress={currentProgress}
        statusMessage={statusMessage}
        error={error}
        canStart={canStart}
        canRetry={canRetry}
        onSelectInput={() => void handleSelectInput()}
        onSelectInputFolder={() => void handleSelectInputFolder()}
        onSelectHint={() => void handleSelectHint()}
        onClearHint={handleClearHint}
        onSelectOutput={() => void handleSelectOutput()}
        onSelectReplacementMedia={() => void handleSelectReplacementMedia()}
        onClearReplacementMedia={handleClearReplacementMedia}
        onOutputRecipeSetting={setOutputRecipeSetting}
        onSelectedPreset={setSelectedPresetId}
        onSelectedModel={setSelectedModelId}
        onVideoEncodeMode={setVideoEncodeMode}
        onAdvancedSetting={setAdvancedSetting}
        onToggleAdvanced={() => setShowAdvanced((value) => !value)}
        onStartJob={() => void startJob()}
        onCancelJob={() => void cancelJob()}
        onResetWorkbench={handleResetWorkbench}
      />
    </div>
  );
}
