import {
  Clapperboard,
  FileVideo,
  FolderDown,
  Layers,
  RotateCcw
} from "lucide-react";
import { fileName } from "@/lib/media";
import { outputRecipeLabel, type OutputRecipeSettings } from "@/lib/outputRecipe";
import { hintModeLabel } from "@/lib/workflowLabels";
import { FileSlot, PanelTitle } from "@/components/workflow/WorkflowPanelPrimitives";

export function WorkflowInputsPanel({
  inputPath,
  hintPath,
  outputPath,
  outputReady,
  outputRecipe,
  isProcessing,
  onSelectInput,
  onSelectInputFolder,
  onSelectHint,
  onClearHint,
  onSelectOutput
}: {
  inputPath: string | null;
  hintPath: string | null;
  outputPath: string | null;
  outputReady: boolean;
  outputRecipe: OutputRecipeSettings;
  isProcessing: boolean;
  onSelectInput: () => void;
  onSelectInputFolder: () => void;
  onSelectHint: () => void;
  onClearHint: () => void;
  onSelectOutput: () => void;
}) {
  return (
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
  );
}
