import { SlidersHorizontal } from "lucide-react";
import type { RuntimeCatalogEntry, RuntimeReadiness } from "@/lib/engine";
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
  modelOptionLabel,
  modelOptionValue,
  presetOptionHelp,
  presetOptionLabel,
  presetOptionValue,
  presetUnavailableLabel,
  screenColorLabel
} from "@/lib/workflowLabels";
import { cn } from "@/lib/utils";
import {
  AdvancedCheckbox,
  AdvancedGroup,
  AdvancedInfo,
  AdvancedNumber,
  AdvancedSelect,
  DisclosureSection,
  PanelTitle
} from "@/components/workflow/WorkflowPanelPrimitives";

export function QualityControlsPanel({
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
  onSelectedPreset,
  onSelectedModel,
  onVideoEncodeMode,
  onAdvancedSetting
}: {
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
  onSelectedPreset: (presetId: string | null) => void;
  onSelectedModel: (modelId: string | null) => void;
  onVideoEncodeMode: (mode: "lossless" | "balanced") => void;
  onAdvancedSetting: <Key extends keyof AdvancedProcessingSettings>(
    key: Key,
    value: AdvancedProcessingSettings[Key]
  ) => void;
}) {
  const selectedPresetModel = selectedPreset
    ? modelChoices.find((model) => model.filename === selectedPreset.recommended_model) ?? null
    : null;
  const selectedPresetHelp = selectedPreset
    ? presetOptionHelp(selectedPreset, selectedPresetModel)
    : null;
  const showRuntimeOverride = modelChoices.length > 0 && (
    modelChoices.length > 1 || presetChoices.length === 0
  );

  return (
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
                <option
                  key={presetOptionValue(preset)}
                  value={presetOptionValue(preset)}
                  title={presetOptionHelp(
                    preset,
                    modelChoices.find((model) => model.filename === preset.recommended_model) ?? null
                  )}
                >
                  {presetOptionLabel(preset)}
                </option>
              ))
            )}
          </select>
          {selectedPresetHelp && (
            <p className="text-xs leading-relaxed text-zinc-500">{selectedPresetHelp}</p>
          )}
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

        <DisclosureSection
          title="Process options"
          description="Overrides for quality, cleanup, and tiling"
        >
          {showRuntimeOverride && (
            <AdvancedGroup title="Runtime override">
              <label className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Model</span>
                <select
                  value={selectedModelId ?? ""}
                  disabled={isProcessing || !runtimeUsable}
                  onChange={(event) => onSelectedModel(event.target.value || null)}
                  className="h-9 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 text-xs text-zinc-100 outline-none transition-colors focus:border-brand disabled:opacity-50"
                >
                  <option value="">Runtime preset default</option>
                  {modelChoices.map((model) => (
                    <option key={modelOptionValue(model)} value={modelOptionValue(model)}>
                      {modelOptionLabel(model)}
                    </option>
                  ))}
                </select>
              </label>
              <AdvancedInfo
                label="Selection policy"
                value={selectedModel ? "Explicit model override" : "Preset chooses the model"}
              />
            </AdvancedGroup>
          )}

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
            <AdvancedInfo
              label="Active screen color"
              value={screenColorLabel(selectedModel ?? selectedPresetModel ?? null)}
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
        </DisclosureSection>
      </div>
    </section>
  );
}
