export function jobStatusTitle(status: string, hasError: boolean, progress: number): string {
  if (hasError || status === "failed") return "Processing Failed";
  if (status === "cancelled") return "Cancelled";
  if (status === "completed" || progress === 100) return "Complete";
  if (status === "running") return "In Progress";
  return "Ready";
}

export function formatJobTiming(value: number | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }

  return `${value.toFixed(1)}ms`;
}
