import { convertFileSrc } from "@tauri-apps/api/core";
import { AlertCircle, FileImage, FileVideo, Zap } from "lucide-react";
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

export function PreviewSurface({
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

function toAssetUrl(path: string): string {
  try {
    return convertFileSrc(path);
  } catch {
    return path;
  }
}
