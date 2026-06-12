import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/layout/sidebar";
import { TopBar } from "./components/layout/topbar";
import { ProcessFlow } from "./components/workflow/ProcessFlow";
import { useEngineStore } from "./lib/store";
import { useJobStore } from "./lib/job";
import { checkRuntimeUpdate, firstRuntimeError, type RuntimeCommandResult } from "./lib/engine";
import {
  runtimeCommandCenterRows,
  runtimeCommandCopyText,
  type RuntimeCommandCenterRow
} from "./lib/runtimeCommands";
import { outputRecipeChips } from "./lib/outputRecipe";
import {
  Settings as SettingsIcon,
  History as HistoryIcon,
  Cpu,
  ExternalLink,
  Trash2,
  Clock,
  Box,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Copy
} from "lucide-react";
import { Button } from "./components/ui/button";

function App() {
  const {
    refreshInfo,
    error: engineError,
    info,
    readiness,
    isLoading: engineLoading,
    getMissingModels,
    getSupportedTracks,
    getDoctorSummary
  } = useEngineStore();
  const {
    history,
    loadHistory,
    clearHistory,
    videoEncodeMode,
    setVideoEncodeMode,
    advancedSettings,
    outputRecipe,
    inputPath,
    inputSourceMode,
    outputPath,
    hintPath,
    selectedPresetId,
    selectedModelId,
    initDefaults
  } = useJobStore();
  const [activeTab, setActiveTab] = useState("Workflow");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [updateResult, setUpdateResult] = useState<RuntimeCommandResult | undefined>();
  const [updateChecking, setUpdateChecking] = useState(false);
  const [historyActionMessage, setHistoryActionMessage] = useState<string | null>(null);

  useEffect(() => {
    refreshInfo();
    loadHistory();
    void initDefaults();
  }, [refreshInfo, loadHistory, initDefaults]);

  const copyHistoryDiagnostics = async (record: (typeof history)[number]) => {
    try {
      await navigator.clipboard.writeText(historyDiagnosticText(record));
      setHistoryActionMessage("History diagnostics copied.");
    } catch {
      setHistoryActionMessage("Could not copy history diagnostics.");
    }
  };

  const revealHistoryOutput = async (record: (typeof history)[number]) => {
    if (!record.output) {
      setHistoryActionMessage("No history output path recorded.");
      return;
    }

    try {
      await invoke("reveal_in_folder", { path: record.output });
      setHistoryActionMessage("History output location opened.");
    } catch {
      setHistoryActionMessage("Could not reveal history output.");
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "Workflow":
        return (
          <div className="mx-auto flex h-full max-w-[1500px] flex-col gap-5">
            <div className="flex flex-col gap-2 border-b border-zinc-900 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand">CorridorKey Runtime</div>
                <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground md:text-3xl">Neural Keying Workbench</h1>
              </div>
              <div className="text-xs font-medium text-zinc-500">
                Source, matte, result
              </div>
            </div>
            <ProcessFlow />
          </div>
        );
      case "History":
        return (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <HistoryIcon className="w-6 h-6 text-brand" /> Job History
              </h2>
              {history.length > 0 && (
                <Button variant="ghost" size="sm" onClick={clearHistory} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                  <Trash2 className="w-4 h-4 mr-2" /> Clear All
                </Button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-800 p-20 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-900">
                  <HistoryIcon className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">No recent jobs found. Process a video to see your history here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {historyActionMessage && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-zinc-400">
                    {historyActionMessage}
                  </div>
                )}
                {history.map((record) => (
                  <div key={record.id} className="rounded-xl border bg-card/50 p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 gap-4">
                        <div className={`h-10 w-10 shrink-0 rounded-lg p-2 ${record.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-brand/10 text-brand"}`}>
                          {record.status === "failed" ? (
                            <AlertCircle className="h-5 w-5" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}
                        </div>
                        <div className="min-w-0 space-y-2">
                          <div className="font-medium text-sm truncate max-w-xs">{fileName(record.input)}</div>
                          <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDuration(record.duration_ms)}</span>
                            <span className="flex items-center gap-1"><Box className="w-3 h-3" /> {record.backend || "backend pending"}</span>
                            <span>Completed {formatCompletionTime(record.completed_at || record.timestamp)}</span>
                            <span>{record.status}</span>
                          </div>
                          <div className="grid gap-1 text-[11px] text-zinc-500">
                            <div className="truncate">
                              <span className="font-bold uppercase tracking-wider text-zinc-600">Input</span>{" "}
                              {record.input}
                            </div>
                            <div className="truncate">
                              <span className="font-bold uppercase tracking-wider text-zinc-600">Output</span>{" "}
                              {record.output}
                            </div>
                            {(record.preset || record.model || record.diagnostic_summary) && (
                              <div className="truncate">
                                {[record.preset, record.model, record.diagnostic_summary].filter(Boolean).join(" | ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Copy History Diagnostics"
                          onClick={() => void copyHistoryDiagnostics(record)}
                        >
                          <Copy className="mr-2 h-4 w-4" /> Copy Diagnostics
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label="Reveal History Output"
                          onClick={() => void revealHistoryOutput(record)}
                        >
                          <ExternalLink className="mr-2 h-4 w-4" /> Reveal Output
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case "Hardware":
        const missingModels = getMissingModels();
        const supportedTracks = getSupportedTracks();
        const doctorSummary = getDoctorSummary();
        const commandRows = runtimeCommandCenterRows(readiness, {
          updateResult,
          processRequest: {
            input: inputPath,
            inputSourceMode,
            output: outputPath,
            hint: hintPath,
            preset: selectedPresetId,
            model: selectedModelId,
            videoEncode: videoEncodeMode,
            outputRecipe,
            advancedSettings
          }
        });
        const backendSupported = (backend: string, legacyValue?: boolean): boolean | undefined => {
          if (legacyValue !== undefined) {
            return legacyValue;
          }
          const supportedBackends = info?.capabilities?.supported_backends;
          return Array.isArray(supportedBackends)
            ? supportedBackends.includes(backend)
            : undefined;
        };

        return (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Cpu className="w-6 h-6 text-brand" /> Runtime Diagnostics
              </h2>
              <Button variant="ghost" size="sm" onClick={refreshInfo} disabled={engineLoading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${engineLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-apple">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Readiness
                  </div>
                  <div className="text-xl font-bold text-zinc-50">
                    {readiness ? readinessLabel(readiness.status) : "Runtime probe pending"}
                  </div>
                  <div className="text-sm text-zinc-400">
                    {doctorSummary || engineError || "Waiting for runtime diagnostics."}
                  </div>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-300">
                  {readiness?.runtime_path || "Runtime path not resolved"}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <DiagnosticPanel title="Missing Model Packs">
                {missingModels.length > 0 ? (
                  <div className="space-y-2">
                    {missingModels.map((model) => (
                      <div key={model} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-200">
                        {model}
                      </div>
                    ))}
                    <p className="text-xs text-zinc-400">
                      Repair or reinstall the desktop runtime package. Maintainers should regenerate the package-runtime payload through the canonical Windows wrapper.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">No missing model packs reported.</p>
                )}
              </DiagnosticPanel>

              <DiagnosticPanel title="Supported Tracks">
                {supportedTracks.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {supportedTracks.map((track) => (
                      <span key={track} className="rounded-lg border border-brand/30 bg-brand/10 px-2 py-1 text-xs font-bold uppercase tracking-wider text-brand">
                        {track}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-400">No track catalog reported.</p>
                )}
              </DiagnosticPanel>

              <DiagnosticPanel title="Backend Support">
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <CapabilityRow label="TensorRT RTX" value={backendSupported("tensorrt", info?.capabilities?.tensorrt_rtx_available)} />
                  <CapabilityRow label="DirectML" value={backendSupported("dml")} />
                  <CapabilityRow label="CPU fallback" value={backendSupported("cpu", info?.capabilities?.cpu_fallback_available)} />
                </div>
              </DiagnosticPanel>

              <DiagnosticPanel title="Runtime Commands">
                <div className="space-y-2">
                  {commandRows.map((row) => (
                    <RuntimeCommandRow
                      key={row.command}
                      row={row}
                      busy={row.command === "check-update" && updateChecking}
                      onRun={row.command === "check-update" && readiness?.runtime_path ? async () => {
                        setUpdateChecking(true);
                        try {
                          setUpdateResult(await checkRuntimeUpdate());
                        } finally {
                          setUpdateChecking(false);
                        }
                      } : undefined}
                    />
                  ))}
                </div>
              </DiagnosticPanel>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Devices</h3>
              {(info?.devices?.length ?? 0) > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {info?.devices?.map((device, index) => (
                    <div key={`${device.name}-${index}`} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-apple">
                      <div className="flex items-center justify-between">
                        <div className="rounded-lg bg-brand/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-brand">
                          {device.backend}
                        </div>
                        {index === 0 && <span className="text-[10px] font-bold uppercase tracking-wider text-brand">Primary</span>}
                      </div>
                      <div className="mt-4 space-y-1">
                        <div className="text-lg font-bold tracking-tight text-zinc-50">{device.name}</div>
                        <div className="text-sm text-zinc-400">
                          {device.memory_mb > 0 ? `${device.memory_mb} MB dedicated VRAM` : "No dedicated VRAM reported"}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-6 text-sm text-zinc-400">
                  Runtime did not report a usable device.
                </div>
              )}
            </div>
          </div>
        );
      case "Settings":
        return (
          <div className="max-w-4xl mx-auto space-y-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <SettingsIcon className="w-6 h-6 text-brand" /> Workflow Defaults
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border bg-card/50 p-6">
                <div className="space-y-1">
                  <div className="font-bold text-lg">Output Encoding</div>
                  <div className="text-sm text-muted-foreground text-balance max-w-md">
                    Default video encoding sent with new jobs. Lossless keeps alpha-friendly review output; balanced favors smaller files.
                  </div>
                </div>
                <div className="flex bg-zinc-900 p-1 rounded-lg border border-zinc-800">
                  <button
                    onClick={() => setVideoEncodeMode("lossless")}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold ${
                      videoEncodeMode === "lossless"
                        ? "bg-brand text-white shadow-apple"
                        : "text-muted-foreground hover:text-zinc-100"
                    }`}
                  >
                    LOSSLESS
                  </button>
                  <button
                    onClick={() => setVideoEncodeMode("balanced")}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold ${
                      videoEncodeMode === "balanced"
                        ? "bg-brand text-white shadow-apple"
                        : "text-muted-foreground hover:text-zinc-100"
                    }`}
                  >
                    BALANCED
                  </button>
                </div>
              </div>

              <div className="space-y-4 rounded-xl border bg-card/50 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-bold text-lg">Output Recipe</div>
                    <div className="text-sm text-muted-foreground text-balance max-w-md">
                      Current source-to-output defaults used by the workbench.
                    </div>
                  </div>
                  <div className="px-3 py-1 rounded-lg bg-zinc-900 text-zinc-300 text-[10px] font-bold border border-zinc-800 uppercase tracking-widest">
                    GUI default
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {outputRecipeChips(outputRecipe).map((chip) => {
                    const [label, ...valueParts] = chip.split(" ");
                    return (
                      <PreferenceChip
                        key={chip}
                        label={label}
                        value={valueParts.join(" ") || chip}
                      />
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 rounded-xl border bg-card/50 p-6">
                <div className="flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="font-bold text-lg">Workflow advanced controls</div>
                    <div className="text-sm text-muted-foreground text-balance max-w-md">
                      Current defaults used by the processing panel.
                    </div>
                  </div>
                  <div className="px-3 py-1 rounded-lg bg-zinc-900 text-zinc-300 text-[10px] font-bold border border-zinc-800 uppercase tracking-widest">
                    GUI default
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <PreferenceChip label="Quality" value={formatSettingValue(advancedSettings.qualityFallback)} />
                  <PreferenceChip label="Refinement" value={formatSettingValue(advancedSettings.refinementMode)} />
                  <PreferenceChip label="Precision" value={advancedSettings.precision.toUpperCase()} />
                  <PreferenceChip label="Resolution" value={advancedSettings.resolution === 0 ? "Auto" : `${advancedSettings.resolution}`} />
                  <PreferenceChip label="Batch" value={`${advancedSettings.batchSize}`} />
                  <PreferenceChip label="Despill" value={advancedSettings.despill.toFixed(2)} />
                  <PreferenceChip label="Despeckle" value={advancedSettings.despeckle ? "On" : "Off"} />
                  <PreferenceChip label="Tiling" value={advancedSettings.tiled ? "Forced" : "Off"} />
                </div>
              </div>
            </div>
          </div>
        );
      case "Support":
        const supportMissingModels = getMissingModels();
        const supportDoctorSummary = getDoctorSummary();
        const supportRuntimeError = readiness ? firstRuntimeError(readiness) : null;
        const failedJobs = history.filter((record) => record.status === "failed").slice(0, 3);
        const hasModelState = Boolean(readiness?.models.ok && readiness.models.value);
        const modelPanelTone = supportMissingModels.length > 0
          ? "error"
          : hasModelState
            ? "ok"
            : "warn";
        const modelPanelStatus = supportMissingModels.length > 0
          ? `${supportMissingModels.length} missing`
          : hasModelState
            ? "reported"
            : "not reported";

        return (
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="flex flex-col gap-2 border-b border-zinc-900 pb-4 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-brand">Desktop Runtime</div>
                <h2 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground md:text-3xl">
                  <HelpCircle className="h-6 w-6 text-brand" /> Runtime recovery
                </h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setActiveTab("Hardware")}>
                <Cpu className="mr-2 h-4 w-4" /> Hardware Diagnostics
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <SupportPanel
                title="Runtime package repair"
                tone={readiness?.status === "ready" ? "ok" : "error"}
                status={readiness ? readinessLabel(readiness.status) : "Runtime probe pending"}
              >
                <div className="space-y-2">
                  <p>{supportRuntimeError?.message || supportDoctorSummary || (readiness ? "Runtime diagnostics did not include a doctor summary." : "Runtime probe pending.")}</p>
                  <p className="font-mono text-[11px] text-zinc-500">
                    {readiness?.runtime_path || "Runtime path not resolved"}
                  </p>
                  {supportRuntimeError?.kind === "missing_runtime" && (
                    <p>Repair or reinstall the desktop runtime package so the GUI can find the bundled engine.</p>
                  )}
                </div>
              </SupportPanel>

              <SupportPanel
                title="Missing model packs"
                tone={modelPanelTone}
                status={modelPanelStatus}
              >
                {supportMissingModels.length > 0 ? (
                  <div className="space-y-2">
                    {supportMissingModels.map((model) => (
                      <div key={model} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 font-mono text-[11px] text-zinc-200">
                        {model}
                      </div>
                    ))}
                    <p>Repair or reinstall the desktop runtime package. Maintainers should regenerate the package-runtime payload through the canonical Windows wrapper.</p>
                  </div>
                ) : hasModelState ? (
                  <p>No missing model packs reported.</p>
                ) : (
                  <p>Model pack state not reported because the runtime models command did not complete.</p>
                )}
              </SupportPanel>

              <SupportPanel
                title="Runtime command failed"
                tone={supportRuntimeError ? "error" : "ok"}
                status={supportRuntimeError?.kind || "no command errors"}
              >
                {supportRuntimeError ? (
                  <div className="space-y-2">
                    <p>
                      Command <span className="font-mono text-zinc-200">{supportRuntimeError.command}</span> reported <span className="font-mono text-zinc-200">{supportRuntimeError.kind}</span>.
                    </p>
                    <p>{supportRuntimeError.message}</p>
                    {(supportRuntimeError.stderr || supportRuntimeError.stdout) && (
                      <pre className="max-h-28 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-[11px] text-zinc-300">
                        {supportRuntimeError.stderr || supportRuntimeError.stdout}
                      </pre>
                    )}
                  </div>
                ) : (
                  <p>Runtime Commands are available in Hardware Diagnostics with copyable JSON. The GUI does not expose arbitrary shell execution.</p>
                )}
              </SupportPanel>

              <SupportPanel
                title="Failed jobs"
                tone={failedJobs.length > 0 ? "error" : "ok"}
                status={failedJobs.length > 0 ? `${failedJobs.length} recent` : "none recorded"}
              >
                {failedJobs.length > 0 ? (
                  <div className="space-y-2">
                    {failedJobs.map((record) => (
                      <div key={record.id} className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs">
                        <div className="font-medium text-zinc-100">{fileName(record.input)}</div>
                        <div className="mt-1 text-zinc-500">{record.diagnostic_summary || "No diagnostic summary recorded."}</div>
                      </div>
                    ))}
                    <p>Open History to copy diagnostics or reveal the intended output path.</p>
                  </div>
                ) : (
                  <p>No failed jobs recorded in this desktop session.</p>
                )}
              </SupportPanel>

              <SupportPanel
                title="Preview proxy recovery"
                tone="warn"
                status="not reported"
              >
                <p>
                  If a source, matte, or result preview cannot play directly, the workbench requests a preview proxy from the packaged runtime. Proxy failures are reported in the workflow diagnostics and usually point to a damaged runtime package or missing video tooling in the desktop payload.
                </p>
              </SupportPanel>

              <SupportPanel
                title="Package repair"
                tone={readiness?.status === "ready" && supportMissingModels.length === 0 ? "ok" : "warn"}
                status="desktop package"
              >
                <p>
                  Use the same runtime package repair path for missing binaries, missing model packs, and preview proxy failures. Hardware Diagnostics shows the runtime path, model state, supported tracks, and command JSON needed for a report.
                </p>
              </SupportPanel>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-transparent text-foreground selection:bg-brand/20 lg:flex-row">
      <Sidebar
        activeTab={activeTab}
        collapsed={sidebarCollapsed}
        onTabChange={setActiveTab}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />

      <main className="flex min-h-0 flex-1 flex-col bg-zinc-950/30 backdrop-blur-sm lg:min-w-0">
        <TopBar />

        <div className="flex-1 overflow-y-auto p-5 lg:p-8">
          {engineError && (
            <div className="mb-8 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in shake-1 duration-500">
              <strong>Engine Error:</strong> {engineError}
            </div>
          )}

          {renderContent()}
        </div>
      </main>
    </div>
  );
}

interface DiagnosticPanelProps {
  title: string;
  children: ReactNode;
}

function DiagnosticPanel({ title, children }: DiagnosticPanelProps) {
  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-apple">
      <h3 className="mb-4 text-[10px] font-bold uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function SupportPanel({
  title,
  tone,
  status,
  children
}: {
  title: string;
  tone: "ok" | "warn" | "error";
  status: string;
  children: ReactNode;
}) {
  const toneClass = tone === "ok"
    ? "border-brand/30 bg-brand/10 text-brand"
    : tone === "warn"
      ? "border-zinc-700 bg-zinc-900 text-zinc-300"
      : "border-destructive/30 bg-destructive/10 text-destructive";
  const Icon = tone === "ok" ? CheckCircle2 : AlertCircle;

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-5 shadow-apple">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`rounded-lg border p-2 ${toneClass}`}>
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-bold text-zinc-100">{title}</h3>
        </div>
        <span className={`shrink-0 rounded border px-2 py-1 text-[9px] font-bold uppercase tracking-wider ${toneClass}`}>
          {status}
        </span>
      </div>
      <div className="space-y-2 text-sm leading-relaxed text-zinc-400">
        {children}
      </div>
    </section>
  );
}

function RuntimeCommandRow({
  row,
  busy = false,
  onRun
}: {
  row: RuntimeCommandCenterRow;
  busy?: boolean;
  onRun?: () => Promise<void>;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const stateClass = row.state === "ok"
    ? "text-brand"
    : row.state === "error"
      ? "text-destructive"
      : "text-zinc-500";
  const policyClass = row.policy === "gated"
    ? "border-zinc-700 bg-zinc-900 text-zinc-500"
    : "border-brand/25 bg-brand/10 text-brand";
  const canCopy = Boolean(row.result);

  const handleCopy = async () => {
    if (!canCopy) {
      return;
    }

    try {
      await navigator.clipboard.writeText(runtimeCommandCopyText(row));
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-zinc-100">{row.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{row.command}</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`rounded border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${policyClass}`}>
            {row.policy}
          </span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${stateClass}`}>
            {row.result?.error?.kind || row.state}
          </span>
        </div>
      </div>
      <div className="mt-2 text-xs leading-relaxed text-zinc-500">
        {row.description}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {onRun && (
          <button
            type="button"
            onClick={() => void onRun()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-wait disabled:opacity-50"
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Checking" : "Run"}
          </button>
        )}
        {canCopy && (
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400 transition-colors hover:border-brand/40 hover:text-brand"
          >
            <Copy className="h-3 w-3" />
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy Failed" : `Copy ${row.label} JSON`}
          </button>
        )}
      </div>
    </div>
  );
}

function PreferenceChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <div className="text-[9px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-1 truncate text-xs font-medium text-zinc-200">{value}</div>
    </div>
  );
}

function CapabilityRow({ label, value }: { label: string; value?: boolean }) {
  const valueText = value === undefined ? "not reported" : value ? "available" : "unsupported";
  const valueClass = value === undefined ? "text-zinc-500" : value ? "text-brand" : "text-destructive";

  return (
    <div className="flex items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
      <span className="text-zinc-300">{label}</span>
      <span className={`text-[10px] font-bold uppercase tracking-wider ${valueClass}`}>
        {valueText}
      </span>
    </div>
  );
}

function readinessLabel(status: string) {
  if (status === "ready") return "Runtime ready";
  if (status === "degraded") return "Runtime usable with diagnostics";
  return "Runtime error";
}

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== "number") return "n/a";
  return `${(durationMs / 1000).toFixed(1)}s`;
}

function formatCompletionTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "n/a";
  }

  return date.toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function fileName(path: string) {
  return path.split(/[\\/]/).pop() || path;
}

function historyDiagnosticText(record: {
  input: string;
  output: string;
  status: string;
  backend: string | null;
  preset?: string | null;
  model?: string | null;
  video_encode?: string;
  duration_ms?: number;
  completed_at?: string;
  timestamp: string;
  diagnostic_summary?: string | null;
}) {
  return [
    "CorridorKey Job History",
    `Status: ${record.status}`,
    `Input: ${record.input}`,
    `Output: ${record.output}`,
    `Backend: ${record.backend || "not reported"}`,
    `Preset: ${record.preset || "runtime default"}`,
    `Model: ${record.model || "runtime default"}`,
    `Encoding: ${record.video_encode || "not reported"}`,
    `Duration: ${formatDuration(record.duration_ms)}`,
    `Completed: ${record.completed_at || record.timestamp}`,
    "",
    "Diagnostic:",
    record.diagnostic_summary || "No diagnostic summary recorded."
  ].join("\n");
}

function formatSettingValue(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default App;
