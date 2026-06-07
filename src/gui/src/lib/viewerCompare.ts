export type ViewerComparisonMode =
  | "single"
  | "vertical"
  | "horizontal"
  | "diagonal"
  | "overlay"
  | "difference";

export type ViewerComparisonPairId =
  | "source-result"
  | "source-hint"
  | "hint-result";

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

export interface ViewerComparisonPairOption {
  id: ViewerComparisonPairId;
  label: string;
  primaryId: string;
  secondaryId: string;
  available: boolean;
  unavailableReason: string | null;
}

export interface ViewerComparisonResolveOptions {
  pairId?: ViewerComparisonPairId | null;
  swapped?: boolean;
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
  mode: ViewerComparisonMode,
  options: ViewerComparisonResolveOptions = {}
): ViewerComparisonState {
  const active = buffers.find((buffer) => buffer.id === activeId) ?? null;
  const source = buffers.find((buffer) => buffer.id === "source") ?? null;
  const explicitPair = options.pairId
    ? comparisonPairOptions(buffers, options.swapped).find((pair) => pair.id === options.pairId) ?? null
    : null;
  const explicitPrimary = explicitPair?.available ? bufferForId(buffers, explicitPair.primaryId) : null;
  const explicitSecondary = explicitPair?.available ? bufferForId(buffers, explicitPair.secondaryId) : null;
  const primary = explicitPrimary ?? source;
  const secondary = explicitSecondary ?? (
    active && active.id !== "source"
      ? active
      : buffers.find((buffer) => buffer.id === "result" && buffer.path) ??
        buffers.find((buffer) => buffer.id === "hint" && buffer.path) ??
        null
  );
  const canCompare = Boolean(primary?.path && secondary?.path && primary.id !== secondary.id);
  const resolvedMode = canCompare ? mode : "single";

  return {
    mode: resolvedMode,
    canCompare,
    primary,
    secondary,
    title: canCompare && primary && secondary
      ? `${primary.label} vs ${secondary.label}`
      : active?.label ?? "Viewer"
  };
}

export function comparisonPairOptions(
  buffers: ViewerBuffer[],
  swapped = false
): ViewerComparisonPairOption[] {
  return COMPARISON_PAIR_DEFS.map((definition) => {
    const first = bufferForId(buffers, definition.firstId);
    const second = bufferForId(buffers, definition.secondId);
    const primary = swapped ? second : first;
    const secondary = swapped ? first : second;
    const missing = [primary, secondary].filter((buffer) => !buffer?.path);

    return {
      id: definition.id,
      label: `${primary?.label ?? definition.firstLabel} / ${secondary?.label ?? definition.secondLabel}`,
      primaryId: primary?.id ?? (swapped ? definition.secondId : definition.firstId),
      secondaryId: secondary?.id ?? (swapped ? definition.firstId : definition.secondId),
      available: missing.length === 0,
      unavailableReason: missing.length === 0
        ? null
        : `Missing ${missing.map((buffer) => buffer?.label ?? "buffer").join(" and ")}`
    };
  });
}

export function availableComparisonPairOptions(
  buffers: ViewerBuffer[],
  swapped = false
): ViewerComparisonPairOption[] {
  return comparisonPairOptions(buffers, swapped).filter((option) => option.available);
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
    return { clipPath: diagonalClipPolygon(position) };
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
    const total = position * 2;
    if (total <= 100) {
      return {
        kind: "diagonal",
        x1: total,
        y1: 0,
        x2: 0,
        y2: total
      };
    }

    return {
      kind: "diagonal",
      x1: 100,
      y1: total - 100,
      x2: total - 100,
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

function diagonalClipPolygon(position: number): string {
  const total = position * 2;
  if (total <= 100) {
    return `polygon(0 0, ${formatPercent(total)} 0, 0 ${formatPercent(total)})`;
  }

  const inset = total - 100;
  return [
    "polygon(0 0",
    "100% 0",
    `100% ${formatPercent(inset)}`,
    `${formatPercent(inset)} 100%`,
    "0 100%)"
  ].join(", ");
}

function bufferForId(buffers: ViewerBuffer[], id: string): ViewerBuffer | null {
  return buffers.find((buffer) => buffer.id === id) ?? null;
}

const COMPARISON_PAIR_DEFS: Array<{
  id: ViewerComparisonPairId;
  firstId: string;
  secondId: string;
  firstLabel: string;
  secondLabel: string;
}> = [
  {
    id: "source-result",
    firstId: "source",
    secondId: "result",
    firstLabel: "Source",
    secondLabel: "Result"
  },
  {
    id: "source-hint",
    firstId: "source",
    secondId: "hint",
    firstLabel: "Source",
    secondLabel: "Alpha Hint"
  },
  {
    id: "hint-result",
    firstId: "hint",
    secondId: "result",
    firstLabel: "Alpha Hint",
    secondLabel: "Result"
  }
];
