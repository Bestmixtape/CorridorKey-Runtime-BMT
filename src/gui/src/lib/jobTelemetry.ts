export interface JobTiming {
  name?: string;
  total_ms?: number;
  sample_count?: number;
}

export interface JobMetrics {
  active_stage?: string;
  proxy_state?: string;
  processed_frames?: number;
  total_frames?: number;
  render_fps?: number;
  decode_fps?: number;
  encode_fps?: number;
  worker_count?: number;
  ram_usage_mb?: number;
  cpu_usage_percent?: number;
  vram_usage_mb?: number;
  peak_ram_mb?: number;
  system_wired_mb?: number;
}

export interface JobTelemetryInput {
  progressPercent: number;
  startedAtMs: number | null;
  finishedAtMs?: number | null;
  nowMs: number;
  timings?: JobTiming[];
  metrics?: JobMetrics;
}

export interface JobTelemetrySummary {
  elapsedLabel: string;
  etaLabel: string;
  fpsLabel: string;
  frameLabel: string;
  stageLabel: string;
  workerLabel: string;
  decodeFpsLabel: string;
  encodeFpsLabel: string;
  throughputLabel: string;
  proxyLabel: string;
  ramLabel: string;
  cpuLabel: string;
  vramLabel: string;
  stageCount: number;
}

export function jobTelemetrySummary(input: JobTelemetryInput): JobTelemetrySummary {
  const elapsedMs = elapsedMilliseconds(input.startedAtMs, input.finishedAtMs ?? input.nowMs);
  const etaMs = etaMilliseconds(input.progressPercent, elapsedMs);

  return {
    elapsedLabel: formatSeconds(elapsedMs),
    etaLabel: etaMs === null ? "n/a" : formatSeconds(etaMs),
    fpsLabel: formatFps(metricNumber(input.metrics?.render_fps) ?? frameFps(input.timings ?? [])),
    frameLabel: frameLabel(input.metrics),
    stageLabel: stageLabel(input.metrics),
    workerLabel: workerLabel(input.metrics),
    decodeFpsLabel: fpsKindLabel(input.metrics?.decode_fps, "decode"),
    encodeFpsLabel: fpsKindLabel(input.metrics?.encode_fps, "encode"),
    throughputLabel: formatFps(throughputFps(input.metrics, elapsedMs)),
    proxyLabel: proxyLabel(input.metrics),
    ramLabel: memoryLabel(input.metrics?.ram_usage_mb, "RAM"),
    cpuLabel: cpuLabel(input.metrics?.cpu_usage_percent),
    vramLabel: memoryLabel(input.metrics?.vram_usage_mb, "VRAM"),
    stageCount: input.timings?.length ?? 0
  };
}

function elapsedMilliseconds(startedAtMs: number | null, endMs: number): number {
  if (typeof startedAtMs !== "number" || !Number.isFinite(startedAtMs)) {
    return 0;
  }

  return Math.max(0, endMs - startedAtMs);
}

function etaMilliseconds(progressPercent: number, elapsedMs: number): number | null {
  if (progressPercent <= 0 || progressPercent >= 100 || elapsedMs <= 0) {
    return null;
  }

  return elapsedMs * ((100 - progressPercent) / progressPercent);
}

function frameFps(timings: JobTiming[]): number | null {
  const frameTiming = timings.find((timing) =>
    typeof timing.total_ms === "number" &&
    typeof timing.sample_count === "number" &&
    timing.sample_count > 0 &&
    timing.total_ms > 0 &&
    (timing.name || "").toLowerCase().includes("frame")
  );

  if (!frameTiming || !frameTiming.total_ms || !frameTiming.sample_count) {
    return null;
  }

  return frameTiming.sample_count / (frameTiming.total_ms / 1000);
}

function throughputFps(metrics: JobMetrics | undefined, elapsedMs: number): number | null {
  const processedFrames = metricNumber(metrics?.processed_frames);
  if (processedFrames === null || processedFrames <= 0 || elapsedMs <= 0) {
    return null;
  }

  return processedFrames / (elapsedMs / 1000);
}

function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function formatFps(value: number | null): string {
  return value === null ? "n/a" : `${value.toFixed(2)} fps`;
}

function frameLabel(metrics: JobMetrics | undefined): string {
  const processedFrames = metricNumber(metrics?.processed_frames);
  const totalFrames = metricNumber(metrics?.total_frames);
  if (processedFrames === null) {
    return "n/a";
  }
  if (totalFrames === null || totalFrames <= 0) {
    return `${Math.round(processedFrames)} frames`;
  }
  return `${Math.round(processedFrames)} / ${Math.round(totalFrames)} frames`;
}

function workerLabel(metrics: JobMetrics | undefined): string {
  const workerCount = metricNumber(metrics?.worker_count);
  if (workerCount === null || workerCount <= 0) {
    return "n/a";
  }
  const rounded = Math.round(workerCount);
  return `${rounded} ${rounded === 1 ? "worker" : "workers"}`;
}

function stageLabel(metrics: JobMetrics | undefined): string {
  const stage = stringMetric(metrics?.active_stage);
  if (!stage) {
    return "n/a";
  }

  const knownStages: Record<string, string> = {
    decode: "Decode",
    decoding: "Decode",
    encode: "Encode",
    encoding: "Encode",
    inference: "Render",
    infer: "Render",
    render: "Render",
    matting: "Matte",
    matte: "Matte",
    proxy: "Proxy",
    proxy_generation: "Proxy generation",
    preview_proxy: "Preview proxy"
  };

  return knownStages[stage] ?? formatMetricText(stage);
}

function proxyLabel(metrics: JobMetrics | undefined): string {
  const proxyState = stringMetric(metrics?.proxy_state);
  return proxyState ? formatMetricText(proxyState) : "n/a";
}

function fpsKindLabel(value: number | undefined, kind: string): string {
  const fps = metricNumber(value);
  return fps === null ? "n/a" : `${fps.toFixed(2)} fps ${kind}`;
}

function memoryLabel(value: number | undefined, kind: string): string {
  const megabytes = metricNumber(value);
  if (megabytes === null || megabytes <= 0) {
    return "n/a";
  }
  return `${Math.round(megabytes)}MB ${kind}`;
}

function cpuLabel(value: number | undefined): string {
  const percent = metricNumber(value);
  if (percent === null || percent < 0) {
    return "n/a";
  }
  return `${percent.toFixed(1)}% CPU`;
}

function stringMetric(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : null;
}

function formatMetricText(value: string): string {
  const normalized = value.replace(/[_-]+/g, " ");
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function metricNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
