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
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { RuntimeCatalogEntry, RuntimeReadiness } from "@/lib/engine";
import { fileName } from "@/lib/media";
import { jobStatusTitle } from "@/lib/jobStatus";
import {
  PRECISION_OPTIONS,
  QUALITY_FALLBACK_OPTIONS,
  REFINEMENT_MODE_OPTIONS,
  RESOLUTION_OPTIONS,
  type AdvancedProcessingSettings,
  type PrecisionMode,
  type QualityFallbackMode,
  type RefinementMode,
  type RuntimeResolution
} from "@/lib/advancedSettings";
import {
  outputRecipeLabel,
  type OutputAlphaMode,
  type OutputArtifactOption,
  type OutputColorIntent,
  type OutputRecipeControlOptions,
  type OutputRecipeSettings,
  type PreviewBackgroundMode
} from "@/lib/outputRecipe";
import {
  artifactOptionStatusLabel,
  displayModeLabel,
  hintModeLabel,
  modelOptionLabel,
  modelOptionValue,
  modelUnavailableLabel,
  presetOptionLabel,
  presetOptionValue,
  presetUnavailableLabel,
  readinessLabel,
  screenColorLabel
} from "@/lib/workflowLabels";
import { cn } from "@/lib/utils";

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
  showAdvanced,
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
  onSelectReplacementMedia,
  onClearReplacementMedia,
  onOutputRecipeSetting,
  onSelectedPreset,
  onSelectedModel,
  onVideoEncodeMode,
  onAdvancedSetting,
  onToggleAdvanced,
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
  showAdvanced: boolean;
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
  onSelectReplacementMedia: () => void;
  onClearReplacementMedia: () => void;
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
  onToggleAdvanced: () => void;
  onStartJob: () => void;
  onCancelJob: () => void;
  onResetWorkbench: () => void;
}) {
  return (
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
            onClick={onSelectInput}
            active={Boolean(inputPath)}
            disabled={isProcessing}
          />
          <button
            type="button"
            disabled={isProcessing}
            onClick={onSelectInputFolder}
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
            onClick={onSelectHint}
            active={Boolean(hintPath)}
            disabled={isProcessing}
          />
          {hintPath && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={onClearHint}
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
            onClick={onSelectOutput}
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
                onClick={() => onOutputRecipeSetting("artifactFamily", option.value)}
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
            onChange={(value) => onOutputRecipeSetting("alphaMode", value as OutputAlphaMode)}
          />

          <AdvancedSelect
            label="Preview background"
            value={outputRecipe.previewBackground}
            options={recipeControls.previewBackgrounds}
            disabled={isProcessing}
            onChange={(value) => onOutputRecipeSetting("previewBackground", value as PreviewBackgroundMode)}
          />

          {outputRecipe.previewBackground === "solid" && (
            <label className="flex items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300">
              <span>Preview color</span>
              <input
                aria-label="Preview color"
                type="color"
                value={outputRecipe.previewSolidColor}
                disabled={isProcessing}
                onChange={(event) => onOutputRecipeSetting("previewSolidColor", event.target.value)}
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
                  onClick={onSelectReplacementMedia}
                  className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Select replacement media
                </button>
                <button
                  type="button"
                  disabled={isProcessing || !outputRecipe.replacementMediaPath}
                  onClick={onClearReplacementMedia}
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
            onChange={(value) => onOutputRecipeSetting("colorIntent", value as OutputColorIntent)}
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
              onChange={(event) => onSelectedPreset(event.target.value || null)}
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
              onChange={(event) => onSelectedModel(event.target.value || null)}
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
                  onClick={() => onVideoEncodeMode(mode)}
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
              onClick={onToggleAdvanced}
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
                    onChange={(value) => onAdvancedSetting("qualityFallback", value as QualityFallbackMode)}
                  />
                  <AdvancedSelect
                    label="Precision"
                    value={advancedSettings.precision}
                    options={PRECISION_OPTIONS}
                    disabled={isProcessing}
                    onChange={(value) => onAdvancedSetting("precision", value as PrecisionMode)}
                  />
                  <AdvancedSelect
                    label="Resolution"
                    value={advancedSettings.resolution}
                    options={RESOLUTION_OPTIONS}
                    disabled={isProcessing}
                    onChange={(value) => onAdvancedSetting("resolution", Number(value) as RuntimeResolution)}
                  />
                  <AdvancedNumber
                    label="Batch size"
                    value={advancedSettings.batchSize}
                    min={1}
                    max={64}
                    step={1}
                    disabled={isProcessing}
                    onChange={(value) => onAdvancedSetting("batchSize", value)}
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
                    onChange={(value) => onAdvancedSetting("despill", value)}
                  />
                  <AdvancedCheckbox
                    label="Despeckle cleanup"
                    checked={advancedSettings.despeckle}
                    disabled={isProcessing}
                    onChange={(value) => onAdvancedSetting("despeckle", value)}
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
                    onChange={(value) => onAdvancedSetting("refinementMode", value as RefinementMode)}
                  />
                  <AdvancedCheckbox
                    label="Force tiled processing"
                    checked={advancedSettings.tiled}
                    disabled={isProcessing}
                    onChange={(value) => onAdvancedSetting("tiled", value)}
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
              onClick={onCancelJob}
              className="w-full gap-2"
            >
              <Square className="h-4 w-4" />
              Cancel
            </Button>
          ) : (
            <Button
              size="lg"
              disabled={!canStart}
              onClick={onStartJob}
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
            onClick={onResetWorkbench}
            className="mt-2 w-full gap-2 text-zinc-400 hover:text-zinc-100"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Workbench
          </Button>
        </div>
      </section>
    </aside>
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
