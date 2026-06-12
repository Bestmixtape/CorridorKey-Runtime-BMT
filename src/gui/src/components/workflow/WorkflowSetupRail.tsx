import type { RuntimeCatalogEntry, RuntimeReadiness } from "@/lib/engine";
import type {
  AdvancedProcessingSettings
} from "@/lib/advancedSettings";
import type {
  OutputArtifactOption,
  OutputRecipeControlOptions,
  OutputRecipeSettings
} from "@/lib/outputRecipe";
import { WorkflowInputsPanel } from "@/components/workflow/WorkflowInputsPanel";
import { OutputRecipePanel } from "@/components/workflow/OutputRecipePanel";
import { QualityControlsPanel } from "@/components/workflow/QualityControlsPanel";
import { WorkflowRunPanel } from "@/components/workflow/WorkflowRunPanel";

export function WorkflowSetupRail({
  inputPath,
  hintPath,
  outputPath,
  outputReady,
  outputRecipe,
  artifactOptions,
  recipeControls,
  isProcessing,
  runtimeUsable,
  presetChoices,
  modelChoices,
  selectedPresetId,
  selectedModelId,
  selectedPreset,
  selectedModel,
  videoEncodeMode,
  advancedSettings,
  readiness,
  terminalStatus,
  currentProgress,
  statusMessage,
  error,
  canStart,
  canRetry,
  onSelectInput,
  onSelectInputFolder,
  onSelectHint,
  onClearHint,
  onSelectOutput,
  onOutputRecipeSetting,
  onSelectedPreset,
  onSelectedModel,
  onVideoEncodeMode,
  onAdvancedSetting,
  onStartJob,
  onCancelJob,
  onResetWorkbench
}: {
  inputPath: string | null;
  hintPath: string | null;
  outputPath: string | null;
  outputReady: boolean;
  outputRecipe: OutputRecipeSettings;
  artifactOptions: OutputArtifactOption[];
  recipeControls: OutputRecipeControlOptions;
  isProcessing: boolean;
  runtimeUsable: boolean;
  presetChoices: RuntimeCatalogEntry[];
  modelChoices: RuntimeCatalogEntry[];
  selectedPresetId: string | null;
  selectedModelId: string | null;
  selectedPreset: RuntimeCatalogEntry | null;
  selectedModel: RuntimeCatalogEntry | null;
  videoEncodeMode: "lossless" | "balanced";
  advancedSettings: AdvancedProcessingSettings;
  readiness: RuntimeReadiness | null;
  terminalStatus: string;
  currentProgress: number;
  statusMessage: string;
  error: string | null;
  canStart: boolean;
  canRetry: boolean;
  onSelectInput: () => void;
  onSelectInputFolder: () => void;
  onSelectHint: () => void;
  onClearHint: () => void;
  onSelectOutput: () => void;
  onOutputRecipeSetting: <Key extends keyof OutputRecipeSettings>(
    key: Key,
    value: OutputRecipeSettings[Key]
  ) => void;
  onSelectedPreset: (presetId: string | null) => void;
  onSelectedModel: (modelId: string | null) => void;
  onVideoEncodeMode: (mode: "lossless" | "balanced") => void;
  onAdvancedSetting: <Key extends keyof AdvancedProcessingSettings>(
    key: Key,
    value: AdvancedProcessingSettings[Key]
  ) => void;
  onStartJob: () => void;
  onCancelJob: () => void;
  onResetWorkbench: () => void;
}) {
  return (
    <aside className="space-y-4">
      <WorkflowInputsPanel
        inputPath={inputPath}
        hintPath={hintPath}
        outputPath={outputPath}
        outputReady={outputReady}
        outputRecipe={outputRecipe}
        isProcessing={isProcessing}
        onSelectInput={onSelectInput}
        onSelectInputFolder={onSelectInputFolder}
        onSelectHint={onSelectHint}
        onClearHint={onClearHint}
        onSelectOutput={onSelectOutput}
      />

      <OutputRecipePanel
        outputRecipe={outputRecipe}
        artifactOptions={artifactOptions}
        recipeControls={recipeControls}
        isProcessing={isProcessing}
        onOutputRecipeSetting={onOutputRecipeSetting}
      />

      <QualityControlsPanel
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
        readiness={readiness}
        onSelectedPreset={onSelectedPreset}
        onSelectedModel={onSelectedModel}
        onVideoEncodeMode={onVideoEncodeMode}
        onAdvancedSetting={onAdvancedSetting}
      />

      <WorkflowRunPanel
        isProcessing={isProcessing}
        readiness={readiness}
        terminalStatus={terminalStatus}
        currentProgress={currentProgress}
        statusMessage={statusMessage}
        error={error}
        canStart={canStart}
        canRetry={canRetry}
        onStartJob={onStartJob}
        onCancelJob={onCancelJob}
        onResetWorkbench={onResetWorkbench}
      />
    </aside>
  );
}
