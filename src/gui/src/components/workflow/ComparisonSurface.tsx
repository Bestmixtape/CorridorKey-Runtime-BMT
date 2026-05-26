import { useCallback, useRef, useState } from "react";
import {
  comparisonClipStyle,
  comparisonDividerGeometry,
  comparisonPositionFromPoint,
  type ViewerComparisonMode
} from "@/lib/viewerCompare";
import { mediaSyncAction, mediaSyncStatus } from "@/lib/viewerSync";
import type { OutputRecipeSettings } from "@/lib/outputRecipe";
import { cn } from "@/lib/utils";
import {
  PreviewSurface,
  type PreviewItem,
  type PreviewSyncRole
} from "@/components/workflow/PreviewSurface";

export function ComparisonSurface({
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
  const isDraggingRef = useRef(false);
  const [syncStatusLabel, setSyncStatusLabel] = useState("Sync pending");
  const clipped = mode === "vertical" || mode === "horizontal" || mode === "diagonal";
  const adjustable = clipped || mode === "overlay";
  const updateSyncStatus = useCallback(() => {
    const primaryVideo = primaryVideoRef.current;
    const secondaryVideo = secondaryVideoRef.current;
    if (!primaryVideo || !secondaryVideo) {
      setSyncStatusLabel("Sync pending");
      return;
    }

    setSyncStatusLabel(mediaSyncStatus(
      readMediaSnapshot(primaryVideo),
      readMediaSnapshot(secondaryVideo)
    ).label);
  }, []);
  const syncFrom = useCallback((role: PreviewSyncRole, showRecoveredStatus = false) => {
    if (isApplyingSyncRef.current) {
      return;
    }

    const anchor = role === "primary" ? primaryVideoRef.current : secondaryVideoRef.current;
    const follower = role === "primary" ? secondaryVideoRef.current : primaryVideoRef.current;
    if (!anchor || !follower) {
      updateSyncStatus();
      return;
    }

    setSyncStatusLabel(mediaSyncStatus(
      readMediaSnapshot(anchor),
      readMediaSnapshot(follower)
    ).label);
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
      if (showRecoveredStatus) {
        updateSyncStatus();
      }
    }, 0);
  }, [updateSyncStatus]);
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
        "relative aspect-video min-h-48 overflow-hidden bg-black sm:min-h-72",
        clipped && "cursor-crosshair"
      )}
      onPointerDown={(event) => {
        if (!clipped) return;
        isDraggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        updatePositionFromPointer(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (!clipped || !isDraggingRef.current) return;
        updatePositionFromPointer(event.clientX, event.clientY);
      }}
      onPointerUp={() => {
        isDraggingRef.current = false;
      }}
      onLostPointerCapture={() => {
        isDraggingRef.current = false;
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
        {title} - {comparisonModeLabel(mode)} - Synced playback - {syncStatusLabel}
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
        <button
          type="button"
          onClick={updateSyncStatus}
          className="rounded-md border border-zinc-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand"
        >
          Check sync
        </button>
        <button
          type="button"
          onClick={() => syncFrom("primary", true)}
          className="rounded-md border border-zinc-800 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand"
        >
          Resync
        </button>
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
      className="ck-wipe-divider pointer-events-none absolute inset-0 h-full w-full overflow-visible"
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

function readMediaSnapshot(video: HTMLVideoElement) {
  return {
    currentTime: video.currentTime,
    duration: video.duration,
    paused: video.paused,
    playbackRate: video.playbackRate
  };
}

function comparisonModeLabel(mode: ViewerComparisonMode): string {
  if (mode === "vertical") return "Vertical wipe";
  if (mode === "horizontal") return "Horizontal wipe";
  if (mode === "diagonal") return "Diagonal wipe";
  if (mode === "overlay") return "Overlay blend";
  if (mode === "difference") return "Difference blend";
  return "Single view";
}
