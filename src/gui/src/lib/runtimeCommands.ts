import type { RuntimeCommandResult, RuntimeReadiness } from "@/lib/engine";
import type { AdvancedProcessingSettings } from "@/lib/advancedSettings";
import type { OutputRecipeSettings } from "@/lib/outputRecipe";

export type RuntimeCommandPolicy = "safe" | "gated";
export type RuntimeCommandState = "ok" | "error" | "disabled";

export interface RuntimeCommandCenterRow {
  command: string;
  label: string;
  description: string;
  policy: RuntimeCommandPolicy;
  state: RuntimeCommandState;
  result?: RuntimeCommandResult;
}

export interface RuntimeProcessRequestSummary {
  input: string | null;
  inputSourceMode: "file" | "folder" | null;
  output: string | null;
  hint: string | null;
  preset: string | null;
  model: string | null;
  videoEncode: "lossless" | "balanced";
  outputRecipe: OutputRecipeSettings;
  advancedSettings: AdvancedProcessingSettings;
}

export interface RuntimeCommandCenterContext {
  updateResult?: RuntimeCommandResult;
  processRequest?: RuntimeProcessRequestSummary;
}

export function runtimeCommandCenterRows(
  readiness: RuntimeReadiness | null,
  context: RuntimeCommandCenterContext = {}
): RuntimeCommandCenterRow[] {
  const probedCommands: Array<[string, string, string, RuntimeCommandResult | undefined]> = [
    ["info", "System Info", "Runtime version, devices, platform, and backend capabilities.", readiness?.info],
    ["doctor", "Doctor", "Operational health, model-pack status, and recovery guidance.", readiness?.doctor],
    ["models", "Models", "Model catalog and installed model-pack state.", readiness?.models],
    ["presets", "Presets", "Runtime-provided processing presets available to this GUI.", readiness?.presets]
  ];

  return [
    ...probedCommands.map(([command, label, description, result]) => ({
      command,
      label,
      description,
      policy: "safe" as const,
      state: commandState(result),
      result
    })),
    {
      command: "check-update",
      label: "Check Update",
      description: context.updateResult
        ? "Latest release check returned by the packaged runtime."
        : "Release availability check is available from the GUI action when explicitly requested.",
      policy: "safe",
      state: context.updateResult
        ? commandState(context.updateResult)
        : readiness?.runtime_path ? "ok" : "disabled",
      result: context.updateResult
    },
    {
      command: "process",
      label: "Process",
      description: "Current Workflow request summary; execution remains owned by the Workflow run controls.",
      policy: "safe",
      state: readiness?.status === "error" ? "disabled" : "ok",
      result: processSummaryResult(readiness, context.processRequest)
    },
    {
      command: "benchmark",
      label: "Benchmark",
      description: "Runtime benchmark can execute heavy media/model work, so it stays disabled until a bounded dry-run policy is selected.",
      policy: "safe",
      state: "disabled"
    },
    {
      command: "download",
      label: "Download",
      description: "Model-pack installation changes local runtime state and is gated.",
      policy: "gated",
      state: "disabled"
    },
    {
      command: "compile-context",
      label: "Compile Context",
      description: "Maintainer packaging command; not exposed as a normal user action.",
      policy: "gated",
      state: "disabled"
    }
  ];
}

function processSummaryResult(
  readiness: RuntimeReadiness | null,
  processRequest: RuntimeProcessRequestSummary | undefined
): RuntimeCommandResult | undefined {
  if (!readiness || readiness.status === "error") {
    return undefined;
  }

  return {
    command: "process",
    ok: true,
    value: {
      runtime_path: readiness.runtime_path,
      request: processRequest ?? null,
      owner: "Workflow"
    },
    error: null
  };
}

export function runtimeCommandCopyText(row: RuntimeCommandCenterRow | undefined): string {
  if (!row) {
    return "";
  }

  return JSON.stringify({
    command: row.command,
    policy: row.policy,
    state: row.state,
    description: row.description,
    result: row.result ?? null
  }, null, 2);
}

function commandState(result: RuntimeCommandResult | undefined): RuntimeCommandState {
  if (!result) return "disabled";
  return result.ok ? "ok" : "error";
}
