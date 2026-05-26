export type ViewerComparisonMode =
  | "single"
  | "vertical"
  | "horizontal"
  | "diagonal"
  | "overlay"
  | "difference";

export interface ViewerBuffer {
  id: string;
  label: string;
  path: string | null;
}

export interface ViewerComparisonState {
  mode: ViewerComparisonMode;
  canCompare: boolean;
  primary: ViewerBuffer | null;
  secondary: ViewerBuffer | null;
  title: string;
}

export interface ComparisonDividerGeometry {
  kind: "vertical" | "horizontal" | "diagonal";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function resolveComparisonState(
  buffers: ViewerBuffer[],
  activeId: string,
  mode: ViewerComparisonMode
): ViewerComparisonState {
  const active = buffers.find((buffer) => buffer.id === activeId) ?? null;
  const source = buffers.find((buffer) => buffer.id === "source") ?? null;
  const secondary = active && active.id !== "source"
    ? active
    : buffers.find((buffer) => buffer.id === "result" && buffer.path) ??
      buffers.find((buffer) => buffer.id === "hint" && buffer.path) ??
      null;
  const canCompare = Boolean(source?.path && secondary?.path && source.id !== secondary.id);
  const resolvedMode = canCompare ? mode : "single";

  return {
    mode: resolvedMode,
    canCompare,
    primary: source,
    secondary,
    title: canCompare && source && secondary
      ? `${source.label} vs ${secondary.label}`
      : active?.label ?? "Viewer"
  };
}

export function comparisonClipStyle(
  mode: ViewerComparisonMode,
  positionPercent: number
): Record<string, string> {
  const position = clampPercent(positionPercent);
  const inverse = 100 - position;

  if (mode === "vertical") {
    return { clipPath: `inset(0 ${inverse}% 0 0)` };
  }

  if (mode === "horizontal") {
    return { clipPath: `inset(0 0 ${inverse}% 0)` };
  }

  if (mode === "diagonal") {
    const geometry = comparisonDividerGeometry("diagonal", position);
    return {
      clipPath: `polygon(0 0, ${formatPercent(geometry.x1)} 0, ${formatPercent(geometry.x2)} 100%, 0 100%)`
    };
  }

  return {};
}

export function comparisonDividerGeometry(
  mode: ViewerComparisonMode,
  positionPercent: number
): ComparisonDividerGeometry {
  const position = clampPercent(positionPercent);

  if (mode === "horizontal") {
    return {
      kind: "horizontal",
      x1: 0,
      y1: position,
      x2: 100,
      y2: position
    };
  }

  if (mode === "diagonal") {
    return {
      kind: "diagonal",
      x1: position * 2,
      y1: 0,
      x2: position * 2 - 100,
      y2: 100
    };
  }

  return {
    kind: "vertical",
    x1: position,
    y1: 0,
    x2: position,
    y2: 100
  };
}

export function comparisonPositionFromPoint(
  mode: ViewerComparisonMode,
  xPercent: number,
  yPercent: number
): number {
  if (mode === "horizontal") {
    return clampPercent(yPercent);
  }

  if (mode === "diagonal") {
    return clampPercent((xPercent + yPercent) / 2);
  }

  return clampPercent(xPercent);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : Number(value.toFixed(3))}%`;
}
