import type { RuntimeCommandResult, RuntimeReadiness } from "@/lib/engine";

export type RuntimeCommandPolicy = "safe" | "gated";
export type RuntimeCommandState = "ok" | "error" | "planned" | "disabled";

export interface RuntimeCommandCenterRow {
  command: string;
  label: string;
  description: string;
  policy: RuntimeCommandPolicy;
  state: RuntimeCommandState;
  result?: RuntimeCommandResult;
}

export function runtimeCommandCenterRows(
  readiness: RuntimeReadiness | null
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
      description: "Release availability check is planned for a future GUI action.",
      policy: "safe",
      state: "planned"
    },
    {
      command: "process",
      label: "Process",
      description: "Current job state is shown in Workflow; command-center request replay is planned.",
      policy: "safe",
      state: readiness?.status === "error" ? "disabled" : "planned"
    },
    {
      command: "benchmark",
      label: "Benchmark",
      description: "Diagnostics-only throughput action is planned once product policy defines limits.",
      policy: "safe",
      state: readiness?.runtime_path ? "planned" : "disabled"
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
