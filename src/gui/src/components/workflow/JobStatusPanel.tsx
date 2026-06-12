import {
  AlertCircle,
  CheckCircle2,
  Copy,
  FolderDown,
  Square,
  Terminal,
  Zap
} from "lucide-react";
import { useMemo, useState } from "react";
import { buildDiagnosticSummary } from "@/lib/diagnosticLog";
import type { JobMetrics, JobTelemetrySummary } from "@/lib/jobTelemetry";
import { formatJobTiming, jobStatusTitle } from "@/lib/jobStatus";
import { cn } from "@/lib/utils";

export function JobStatusPanel({
  terminalStatus,
  currentProgress,
  statusMessage,
  error,
  activeBackend,
  artifactPath,
  warnings,
  timings,
  logs,
  metrics,
  telemetry,
  recipeChips,
  artifactMetadata,
  showLogs,
  onRevealArtifact,
  onToggleLogs
}: {
  terminalStatus: string;
  currentProgress: number;
  statusMessage: string;
  error: string | null;
  activeBackend: string | null;
  artifactPath: string | null;
  warnings: string[];
  timings: Array<{ name?: string; total_ms?: number; sample_count?: number }> | undefined;
  logs: string[];
  metrics: JobMetrics;
  telemetry: JobTelemetrySummary;
  recipeChips: string[];
  artifactMetadata: Record<string, string>;
  showLogs: boolean;
  onRevealArtifact: () => void;
  onToggleLogs: () => void;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const Icon = error || terminalStatus === "failed"
    ? AlertCircle
    : terminalStatus === "completed" || currentProgress === 100
      ? CheckCircle2
      : terminalStatus === "cancelled"
        ? Square
        : Zap;
  const diagnosticSummary = useMemo(() => buildDiagnosticSummary({
    status: terminalStatus,
    statusMessage,
    backend: activeBackend,
    artifactPath,
    error,
    warnings,
    recipeChips,
    artifactMetadata,
    metrics,
    timings,
    logs
  }), [
    terminalStatus,
    statusMessage,
    activeBackend,
    artifactPath,
    error,
    warnings,
    recipeChips,
    artifactMetadata,
    metrics,
    timings,
    logs
  ]);

  const handleCopyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticSummary);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 shadow-apple">
      <div className="grid gap-4 lg:grid-cols-[minmax(12rem,16rem)_1fr] lg:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn(
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
            error || terminalStatus === "failed"
              ? "bg-destructive/10 text-destructive"
              : terminalStatus === "completed" || currentProgress === 100
                ? "bg-brand/10 text-brand"
                : "bg-zinc-900 text-zinc-400"
          )}>
            <Icon className={cn("h-5 w-5", terminalStatus === "running" && "animate-pulse")} />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-zinc-50">
              {jobStatusTitle(terminalStatus, Boolean(error), currentProgress)}
            </div>
            {telemetry.headlineLabel !== "n/a" && (
              <div className="mt-1 text-xs font-bold text-brand">
                {telemetry.headlineLabel}
              </div>
            )}
            <div className={cn("mt-1 break-words text-xs", error ? "text-destructive" : "text-zinc-400")}>
              {statusMessage}
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap gap-2">
          {activeBackend && <StatusPill label={activeBackend} />}
          <StatusPill label={`Elapsed ${telemetry.elapsedLabel}`} />
          {telemetry.frameLabel !== "n/a" && <StatusPill label={telemetry.frameLabel} />}
          {telemetry.throughputLabel !== "n/a" && <StatusPill label={`Throughput ${telemetry.throughputLabel}`} />}
          {telemetry.decodeFpsLabel !== "n/a" && <StatusPill label={telemetry.decodeFpsLabel} />}
          {telemetry.encodeFpsLabel !== "n/a" && <StatusPill label={telemetry.encodeFpsLabel} />}
          {telemetry.proxyLabel !== "n/a" && <StatusPill label={`Proxy ${telemetry.proxyLabel}`} />}
          {telemetry.workerLabel !== "n/a" && <StatusPill label={telemetry.workerLabel} />}
          {telemetry.stageCount > 0 && <StatusPill label={`${telemetry.stageCount} stages`} />}
          {recipeChips.slice(0, 16).map((chip) => (
            <StatusPill key={chip} label={chip} />
          ))}
          {telemetry.ramLabel !== "n/a" && <StatusPill label={telemetry.ramLabel} />}
          {telemetry.cpuLabel !== "n/a" && <StatusPill label={telemetry.cpuLabel} />}
          {telemetry.vramLabel !== "n/a" && <StatusPill label={telemetry.vramLabel} />}
          <StatusPill label={`${Math.round(currentProgress)}%`} />
        </div>
      </div>

      {!error && (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full bg-brand transition-all duration-500 ease-out"
            style={{ width: `${currentProgress}%` }}
          />
        </div>
      )}

      {error && (
        <div className="mt-4 max-h-32 overflow-auto rounded-lg border border-destructive/15 bg-destructive/5 p-3 font-mono text-xs text-destructive">
          {error}
        </div>
      )}

      {artifactPath && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
          <span className="font-bold text-zinc-100">Artifact:</span> {artifactPath}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {warnings.map((warning, index) => (
            <div key={`${warning}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-300">
              {warning}
            </div>
          ))}
        </div>
      )}

      {timings && timings.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-3">
          {timings.slice(0, 3).map((timing, index) => (
            <div key={`${timing.name || "stage"}-${index}`} className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <div className="truncate text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                {timing.name || "Stage"}
              </div>
              <div className="font-mono text-sm text-zinc-100">
                {formatJobTiming(timing.total_ms)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onToggleLogs}
          className="flex items-center gap-2 text-[10px] text-zinc-500 transition-colors hover:text-zinc-100"
        >
          <Terminal className="h-3 w-3" />
          {showLogs ? "Hide Technical Logs" : "View Technical Logs"}
        </button>
        <button
          type="button"
          onClick={handleCopyDiagnostics}
          className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand"
        >
          <Copy className="h-3 w-3" />
          {copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy Failed" : "Copy Diagnostics"}
        </button>
        {artifactPath && (
          <button
            type="button"
            onClick={onRevealArtifact}
            className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <FolderDown className="h-3 w-3" />
            Reveal Output
          </button>
        )}
      </div>

      {showLogs && (
        <div className="mt-4 max-h-48 overflow-auto rounded-lg bg-black/90 p-4 font-mono text-[10px] text-brand/80 whitespace-pre-wrap">
          {logs.length > 0 ? logs.join("\n") : "Waiting for engine output..."}
        </div>
      )}
    </section>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <div className="rounded bg-zinc-900 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-400">
      {label}
    </div>
  );
}
