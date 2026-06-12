import { convertFileSrc } from "@tauri-apps/api/core";
import { AlertCircle, FileImage, FileVideo, RefreshCw, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  previewBackgroundStyle,
  type OutputRecipeSettings
} from "@/lib/outputRecipe";
import { cn } from "@/lib/utils";

export type PreviewMode = "source" | "hint" | "result";
export type PreviewSyncRole = "primary" | "secondary";

export interface PreviewItem {
  id: PreviewMode;
  label: string;
  badge: string;
  path: string | null;
  pendingPath?: string | null;
  icon: typeof FileVideo;
  emptyTitle: string;
  emptySubtitle: string;
}

export interface PreviewVideoSync {
  role: PreviewSyncRole;
  register: (role: PreviewSyncRole, element: HTMLVideoElement | null) => void;
  syncFrom: (role: PreviewSyncRole) => void;
}

export interface PreviewPlaybackSnapshot {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
}

export function PreviewSurface({
  item,
  outputRecipe,
  fill = false,
  videoSync,
  playbackSnapshot,
  onPlaybackSnapshot
}: {
  item: PreviewItem;
  outputRecipe: OutputRecipeSettings;
  fill?: boolean;
  videoSync?: PreviewVideoSync;
  playbackSnapshot?: PreviewPlaybackSnapshot | null;
  onPlaybackSnapshot?: (snapshot: PreviewPlaybackSnapshot) => void;
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
        "ck-preview-empty flex flex-col items-center justify-center gap-3 px-6 text-center",
        fill ? "h-full w-full" : "aspect-video min-h-48 sm:min-h-72"
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

  const requestPreviewProxy = () => {
    const requestedPath = item.path;
    if (!requestedPath) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setProxyPath(null);
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

  const handleVideoError = () => {
    if (proxyPath || isCreatingProxy) {
      setPreviewError(
        proxyPath
          ? "Preview proxy could not be loaded."
          : "Preview could not be loaded."
      );
      return;
    }

    requestPreviewProxy();
  };

  const emitPlaybackSnapshot = (video: HTMLVideoElement) => {
    onPlaybackSnapshot?.({
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      playbackRate: video.playbackRate
    });
  };

  const restorePlaybackSnapshot = (video: HTMLVideoElement) => {
    if (!playbackSnapshot) return;

    const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    const snapshotDuration = Number.isFinite(playbackSnapshot.duration) && playbackSnapshot.duration > 0
      ? playbackSnapshot.duration
      : null;
    const targetTime = duration && snapshotDuration
      ? duration * (playbackSnapshot.currentTime / snapshotDuration)
      : playbackSnapshot.currentTime;

    if (Number.isFinite(targetTime) && targetTime > 0) {
      video.currentTime = Math.max(0, duration ? Math.min(targetTime, duration) : targetTime);
    }
    if (Number.isFinite(playbackSnapshot.playbackRate) && playbackSnapshot.playbackRate > 0) {
      video.playbackRate = playbackSnapshot.playbackRate;
    }
    if (!playbackSnapshot.paused && !fill) {
      void video.play().catch(() => undefined);
    }
  };

  if (isCreatingProxy) {
    return (
      <div className={cn(
        "flex flex-col items-center justify-center gap-3 bg-zinc-950 px-6 text-center",
        fill ? "h-full w-full" : "aspect-video min-h-48 sm:min-h-72"
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
        fill ? "h-full w-full" : "aspect-video min-h-48 sm:min-h-72"
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
        <button
          type="button"
          onClick={requestPreviewProxy}
          className="mt-1 inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-bold text-zinc-300 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <RefreshCw className="h-4 w-4" />
          Retry preview
        </button>
      </div>
    );
  }

  if (previewKind === "image") {
    return (
      <div
        className={cn(previewBackground.className, fill ? "h-full w-full" : "aspect-video min-h-48 sm:min-h-72")}
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
        className={cn("relative", previewBackground.className, fill ? "h-full w-full" : "aspect-video min-h-48 sm:min-h-72")}
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
          onLoadedMetadata={(event) => {
            setPreviewError(null);
            restorePlaybackSnapshot(event.currentTarget);
            emitPlaybackSnapshot(event.currentTarget);
            videoSync?.syncFrom(videoSync.role);
          }}
          onPlay={(event) => {
            emitPlaybackSnapshot(event.currentTarget);
            videoSync?.syncFrom(videoSync.role);
          }}
          onPause={(event) => {
            emitPlaybackSnapshot(event.currentTarget);
            videoSync?.syncFrom(videoSync.role);
          }}
          onRateChange={(event) => {
            emitPlaybackSnapshot(event.currentTarget);
            videoSync?.syncFrom(videoSync.role);
          }}
          onSeeked={(event) => {
            emitPlaybackSnapshot(event.currentTarget);
            videoSync?.syncFrom(videoSync.role);
          }}
          onTimeUpdate={(event) => {
            emitPlaybackSnapshot(event.currentTarget);
            videoSync?.syncFrom(videoSync.role);
          }}
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
      fill ? "h-full w-full" : "aspect-video min-h-48 sm:min-h-72"
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

function toAssetUrl(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}
