import {
  ChevronRight,
  PlayCircle,
  RotateCcw,
  Square
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RuntimeReadiness } from "@/lib/engine";
import { jobStatusTitle } from "@/lib/jobStatus";
import { readinessLabel } from "@/lib/workflowLabels";
import { cn } from "@/lib/utils";

export function WorkflowRunPanel({
  isProcessing,
  readiness,
  terminalStatus,
  currentProgress,
  statusMessage,
  error,
  canStart,
  canRetry,
  onStartJob,
  onCancelJob,
  onResetWorkbench
}: {
  isProcessing: boolean;
  readiness: RuntimeReadiness | null;
  terminalStatus: string;
  currentProgress: number;
  statusMessage: string;
  error: string | null;
  canStart: boolean;
  canRetry: boolean;
  onStartJob: () => void;
  onCancelJob: () => void;
  onResetWorkbench: () => void;
}) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-apple">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-bold text-zinc-50">{jobStatusTitle(terminalStatus, Boolean(error), currentProgress)}</div>
          <div className={cn("mt-1 text-xs", error ? "text-destructive" : "text-zinc-400")}>
            {statusMessage}
          </div>
        </div>
        <RuntimeDot readiness={readiness} />
      </div>

      <div className="mt-4">
        {isProcessing ? (
          <Button
            size="lg"
            variant="destructive"
            onClick={onCancelJob}
            className="w-full gap-2"
          >
            <Square className="h-4 w-4" />
            Cancel
          </Button>
        ) : (
          <Button
            size="lg"
            disabled={!canStart}
            onClick={onStartJob}
            className="w-full gap-2"
          >
            {canRetry ? (
              <>
                <RotateCcw className="h-4 w-4" />
                Retry
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4" />
                Run Neural Keyer
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </>
            )}
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          disabled={isProcessing}
          onClick={onResetWorkbench}
          className="mt-2 w-full gap-2 text-zinc-400 hover:text-zinc-100"
        >
          <RotateCcw className="h-4 w-4" />
          Reset Workbench
        </Button>
      </div>
    </section>
  );
}

function RuntimeDot({ readiness }: { readiness: RuntimeReadiness | null }) {
  const color = readiness?.status === "ready"
    ? "bg-brand"
    : readiness?.status === "degraded"
      ? "bg-zinc-500"
      : "bg-destructive";
  const label = readiness ? readinessLabel(readiness.status) : "Runtime probe pending";

  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1">
      <span className={cn("h-2 w-2 rounded-full", color)} />
      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{label}</span>
    </div>
  );
}
