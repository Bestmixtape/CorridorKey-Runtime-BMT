import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Activity,
  AlertCircle,
  FileImage,
  FileVideo,
  FolderDown,
  Layers,
  Zap
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  fileExtension,
  fileName,
  previewKindForPath
} from "@/lib/media";
import {
  createPreviewProxy,
  formatPreviewError
} from "@/lib/preview";
import {
  comparisonClipStyle,
  comparisonDividerGeometry,
  comparisonPositionFromPoint,
  resolveComparisonState,
  type ViewerComparisonMode
} from "@/lib/viewerCompare";
import { mediaSyncAction } from "@/lib/viewerSync";
import {
  previewBackgroundStyle,
  type OutputRecipeSettings
} from "@/lib/outputRecipe";

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

function readinessStatusLabel(status: string): string {
  if (status === "completed") return "Result ready";
  if (status === "failed") return "Runtime failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "running") return "Processing";
  return "Ready";
}

function toAssetUrl(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}
