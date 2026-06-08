import {
  Activity,
  ArrowLeftRight,
  Blend,
  Columns2,
  Contrast,
  FileVideo,
  FolderDown,
  Layers,
  MousePointer2,
  Rows2,
  Slash,
  Square,
  type LucideIcon
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { fileName } from "@/lib/media";
import {
  availableComparisonPairOptions,
  resolveComparisonState,
  type ViewerComparisonPairId,
  type ViewerComparisonMode,
  type ViewerComparisonWipeMode
} from "@/lib/viewerCompare";
import type { OutputRecipeSettings } from "@/lib/outputRecipe";
import { ComparisonSurface } from "@/components/workflow/ComparisonSurface";
import {
  PreviewSurface,
  type PreviewItem,
  type PreviewMode,
  type PreviewPlaybackSnapshot
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
  const [comparisonMode, setComparisonMode] = useState<ViewerComparisonMode>("auto");
  const [autoComparisonMode, setAutoComparisonMode] = useState<ViewerComparisonWipeMode>("vertical");
  const [comparisonPairId, setComparisonPairId] = useState<ViewerComparisonPairId>("source-result");
  const [comparisonPosition, setComparisonPosition] = useState(50);
  const [comparisonSwapped, setComparisonSwapped] = useState(false);
  const [singlePlaybackSnapshot, setSinglePlaybackSnapshot] = useState<PreviewPlaybackSnapshot | null>(null);
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
  const availablePairOptions = availableComparisonPairOptions(previewItems, comparisonSwapped);
  const activePair =
    availablePairOptions.find((pair) => pair.id === comparisonPairId) ?? availablePairOptions[0];
  const comparisonState = resolveComparisonState(previewItems, activePreview, comparisonMode, {
    pairId: comparisonPairId,
    swapped: comparisonSwapped
  });
  const primaryItem = previewItems.find((item) => item.id === comparisonState.primary?.id) ?? previewItems[0];
  const secondaryItem = previewItems.find((item) => item.id === comparisonState.secondary?.id) ?? activeItem;
  const effectiveComparisonMode =
    comparisonState.mode === "auto" ? autoComparisonMode : comparisonState.mode;

  useEffect(() => {
    if (artifactPath) {
      setActivePreview("result");
    }
  }, [artifactPath]);

  useEffect(() => {
    if (availablePairOptions.length === 0) {
      return;
    }

    if (!availablePairOptions.some((pair) => pair.id === comparisonPairId)) {
      setComparisonPairId(availablePairOptions[0].id);
    }
  }, [
    availablePairOptions.map((pair) => pair.id).join("|"),
    comparisonMode,
    comparisonPairId
  ]);

  useEffect(() => {
    setActivePreview("source");
    setComparisonMode("auto");
    setAutoComparisonMode("vertical");
    setComparisonPairId("source-result");
    setComparisonPosition(50);
    setComparisonSwapped(false);
    setSinglePlaybackSnapshot(null);
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

          {availablePairOptions.length > 0 && (
            <>
              <div className="grid grid-cols-1 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1 sm:grid-cols-3">
                {availablePairOptions.map((pair) => (
                  <button
                    key={pair.id}
                    type="button"
                    title={pair.label}
                    onClick={() => setComparisonPairId(pair.id)}
                    className={cn(
                      "min-h-8 rounded-md px-2 py-1 text-xs font-bold transition-colors",
                      comparisonPairId === pair.id
                        ? "bg-brand text-white"
                        : "text-zinc-400 hover:text-zinc-100"
                    )}
                  >
                    <span className="block truncate">{pair.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={!activePair}
                onClick={() => setComparisonSwapped((value) => !value)}
                aria-label="Swap comparison sides"
                title="Swap comparison sides"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 transition-colors hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>

              <div className="grid grid-cols-7 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
                {COMPARISON_MODES.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={mode.id !== "single" && !comparisonState.canCompare}
                    aria-label={mode.label}
                    title={mode.tooltip}
                    onClick={() => setComparisonMode(mode.id)}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                      comparisonMode === mode.id
                        ? "bg-brand text-white"
                        : "text-zinc-400 hover:text-zinc-100"
                    )}
                  >
                    <mode.icon className="h-4 w-4" />
                    <span className="sr-only">{mode.label}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="relative bg-black">
        {comparisonState.canCompare && comparisonState.mode !== "single" ? (
          <ComparisonSurface
            mode={effectiveComparisonMode}
            autoMode={comparisonState.mode === "auto"}
            position={comparisonPosition}
            primary={primaryItem}
            secondary={secondaryItem}
            title={comparisonState.title}
            outputRecipe={outputRecipe}
            onPositionChange={setComparisonPosition}
            onAutoModeChange={setAutoComparisonMode}
          />
        ) : (
          <PreviewSurface
            item={activeItem}
            outputRecipe={outputRecipe}
            playbackSnapshot={singlePlaybackSnapshot}
            onPlaybackSnapshot={setSinglePlaybackSnapshot}
          />
        )}
      </div>
    </section>
  );
}

const COMPARISON_MODES: Array<{
  id: ViewerComparisonMode;
  label: string;
  tooltip: string;
  icon: LucideIcon;
}> = [
  { id: "single", label: "Single view", tooltip: "Show one buffer", icon: Square },
  { id: "auto", label: "Auto compare", tooltip: "Drag the handle to choose vertical, horizontal, or diagonal wipe", icon: MousePointer2 },
  { id: "vertical", label: "Vertical wipe", tooltip: "Compare with a vertical wipe", icon: Columns2 },
  { id: "horizontal", label: "Horizontal wipe", tooltip: "Compare with a horizontal wipe", icon: Rows2 },
  { id: "diagonal", label: "Diagonal wipe", tooltip: "Compare with a diagonal wipe", icon: Slash },
  { id: "overlay", label: "Overlay blend", tooltip: "Blend both buffers", icon: Blend },
  { id: "difference", label: "Difference blend", tooltip: "Show the difference between buffers", icon: Contrast }
];

function readinessStatusLabel(status: string): string {
  if (status === "completed") return "Result ready";
  if (status === "failed") return "Runtime failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "running") return "Processing";
  return "Ready";
}
