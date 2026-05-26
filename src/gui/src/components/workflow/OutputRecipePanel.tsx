import { FileImage } from "lucide-react";
import { fileName } from "@/lib/media";
import {
  type OutputAlphaMode,
  type OutputArtifactOption,
  type OutputColorIntent,
  type OutputRecipeControlOptions,
  type OutputRecipeSettings,
  type PreviewBackgroundMode
} from "@/lib/outputRecipe";
import { artifactOptionStatusLabel } from "@/lib/workflowLabels";
import { cn } from "@/lib/utils";
import {
  AdvancedSelect,
  PanelTitle
} from "@/components/workflow/WorkflowPanelPrimitives";

export function OutputRecipePanel({
  outputRecipe,
  artifactOptions,
  recipeControls,
  isProcessing,
  onOutputRecipeSetting,
  onSelectReplacementMedia,
  onClearReplacementMedia
}: {
  outputRecipe: OutputRecipeSettings;
  artifactOptions: OutputArtifactOption[];
  recipeControls: OutputRecipeControlOptions;
  isProcessing: boolean;
  onOutputRecipeSetting: <Key extends keyof OutputRecipeSettings>(
    key: Key,
    value: OutputRecipeSettings[Key]
  ) => void;
  onSelectReplacementMedia: () => void;
  onClearReplacementMedia: () => void;
}) {
  return (
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
  );
}
