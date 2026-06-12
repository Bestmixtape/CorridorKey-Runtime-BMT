export interface DiagnosticTiming {
  name?: string;
  total_ms?: number;
  sample_count?: number;
}

export interface DiagnosticSummaryInput {
  status: string;
  statusMessage: string;
  backend: string | null;
  artifactPath: string | null;
  error: string | null;
  warnings: string[];
  recipeChips?: string[];
  artifactMetadata?: Record<string, unknown>;
  metrics?: object;
  timings: DiagnosticTiming[] | undefined;
  logs: string[];
}

export function buildDiagnosticSummary(input: DiagnosticSummaryInput): string {
  const lines = [
    "CorridorKey Runtime Diagnostics",
    `Status: ${input.status}`,
    `Message: ${input.statusMessage}`
  ];

  if (input.backend) {
    lines.push(`Backend: ${input.backend}`);
  }

  if (input.artifactPath) {
    lines.push(`Artifact: ${input.artifactPath}`);
  }

  if (input.error) {
    lines.push(`Error: ${input.error}`);
  }

  if (input.warnings.length > 0) {
    lines.push("", "Warnings:");
    for (const warning of input.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  if (input.recipeChips && input.recipeChips.length > 0) {
    lines.push("", "Job recipe:");
    for (const chip of input.recipeChips) {
      lines.push(`- ${chip}`);
    }
  }

  const artifactMetadata = renderableEntries(input.artifactMetadata);
  if (artifactMetadata.length > 0) {
    lines.push("", "Artifact metadata:");
    for (const [key, value] of artifactMetadata) {
      lines.push(`${key}: ${value}`);
    }
  }

  const metrics = renderableEntries(input.metrics);
  if (metrics.length > 0) {
    lines.push("", "Metrics:");
    for (const [key, value] of metrics) {
      lines.push(`${key}: ${value}`);
    }
  }

  if (input.timings && input.timings.length > 0) {
    lines.push("", "Timings:");
    for (const timing of input.timings) {
      lines.push(formatTimingLine(timing));
    }
  }

  if (input.logs.length > 0) {
    lines.push("", "Raw logs:");
    lines.push(...input.logs);
  }

  return lines.join("\n");
}

function formatTimingLine(timing: DiagnosticTiming): string {
  const name = timing.name || "stage";
  const total = typeof timing.total_ms === "number" && Number.isFinite(timing.total_ms)
    ? `${timing.total_ms.toFixed(1)}ms`
    : "n/a";
  const samples = typeof timing.sample_count === "number" && Number.isFinite(timing.sample_count)
    ? ` (${timing.sample_count} samples)`
    : "";

  return `${name}: ${total}${samples}`;
}

function renderableEntries(input: object | undefined): Array<[string, string | number | boolean]> {
  if (!input) {
    return [];
  }

  return Object.entries(input).filter((entry): entry is [string, string | number | boolean] =>
    isRenderableMetric(entry[1])
  );
}

function isRenderableMetric(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}
