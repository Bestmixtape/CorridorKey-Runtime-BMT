import { AlertCircle, Loader2, Monitor } from "lucide-react";
import { useEngineStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function TopBar() {
  const { readiness, isLoading, getPrimaryGpu } = useEngineStore();
  const gpu = getPrimaryGpu();
  const hasRuntime = Boolean(readiness?.runtime_path);

  const statusLabel = isLoading
    ? "Probing Runtime"
    : readiness?.status === "ready"
      ? "Runtime Ready"
      : readiness?.status === "degraded"
        ? "Runtime Needs Attention"
        : hasRuntime
          ? "Runtime Error"
          : "Runtime Missing";

  const statusClass = isLoading
    ? "bg-brand animate-pulse"
    : readiness?.status === "ready"
      ? "bg-brand"
      : readiness?.status === "degraded"
        ? "bg-zinc-500"
        : "bg-destructive";

  const deviceLabel = gpu?.name ?? (hasRuntime ? "No runtime device reported" : "Runtime not found");

  return (
    <header className="flex h-14 items-center justify-between border-b border-zinc-800 bg-zinc-950/40 px-8 backdrop-blur-md">
      <div className="flex items-center gap-2">
        <div className={cn("h-2 w-2 rounded-md", statusClass)} />
        <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">
          {statusLabel}
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1 text-[10px] font-bold text-zinc-200">
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : readiness?.status === "error" ? (
            <AlertCircle className="h-3 w-3 text-destructive" />
          ) : (
            <Monitor className="h-3 w-3" />
          )}
          <span className="max-w-64 truncate">{deviceLabel}</span>
        </div>
      </div>
    </header>
  );
}
