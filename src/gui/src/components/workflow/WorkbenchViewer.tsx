import {
  Activity,
  ArrowLeftRight,
  FileVideo,
  FolderDown,
  Layers
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { fileName } from "@/lib/media";
import {
  comparisonPairOptions,
  resolveComparisonState,
  type ViewerComparisonPairId,
  type ViewerComparisonMode
} from "@/lib/viewerCompare";
import type { OutputRecipeSettings } from "@/lib/outputRecipe";
import { ComparisonSurface } from "@/components/workflow/ComparisonSurface";
import {
  PreviewSurface,
  type PreviewItem,
  type PreviewMode
} from "@/components/workflow/PreviewSurface";

export function WorkbenchViewer({
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
  const [comparisonPairId, setComparisonPairId] = useState<ViewerComparisonPairId>("source-result");
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const [comparisonSwapped, setComparisonSwapped] = useState(false);
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
  const pairOptions = comparisonPairOptions(previewItems, comparisonSwapped);
  const activePair = pairOptions.find((pair) => pair.id === comparisonPairId) ?? pairOptions[0];
  const comparisonState = resolveComparisonState(previewItems, activePreview, comparisonMode, {
    pairId: comparisonPairId,
    swapped: comparisonSwapped
  });
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
    setComparisonPairId("source-result");
    setComparisonPosition(50);
    setComparisonSwapped(false);
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

          <div className="grid grid-cols-3 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            {pairOptions.map((pair) => (
              <button
                key={pair.id}
                type="button"
                disabled={!pair.available}
                title={pair.unavailableReason ?? pair.label}
                onClick={() => setComparisonPairId(pair.id)}
                className={cn(
                  "min-h-10 rounded-md px-2 py-1 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-55",
                  comparisonPairId === pair.id
                    ? "bg-brand text-white"
                    : "text-zinc-400 hover:text-zinc-100"
                )}
              >
                <span className="block truncate">{pair.label}</span>
                {!pair.available && (
                  <span className="block truncate text-[9px] font-medium uppercase tracking-wider text-zinc-500">
                    {pair.unavailableReason}
                  </span>
                )}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={!activePair?.available}
            onClick={() => setComparisonSwapped((value) => !value)}
            className="flex h-10 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 text-xs font-bold text-zinc-400 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeftRight className="h-4 w-4" />
            Swap sides
          </button>

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

function readinessStatusLabel(status: string): string {
  if (status === "completed") return "Result ready";
  if (status === "failed") return "Runtime failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "running") return "Processing";
  return "Ready";
}
