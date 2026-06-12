import type {
  DoctorReport,
  RuntimeCatalogEntry,
  RuntimeModelsCatalog,
  RuntimeReadiness,
  SystemInfo
} from "@/lib/engine";

type CatalogKey = "models" | "presets";
type PlatformFamily = "windows" | "macos" | "unknown";

export function modelChoices(readiness: RuntimeReadiness | null): RuntimeCatalogEntry[] {
  if (!readiness || readiness.status === "error") {
    return [];
  }

  const catalogModels = catalogEntries(readiness.models.value, "models");
  const doctorModels = doctorModelEntries(readiness.doctor.value);
  const doctorByFilename = new Map(
    doctorModels
      .map((model) => [modelIdentity(model), model] as const)
      .filter(([identity]) => identity.length > 0)
  );
  const platform = activePlatformFamily(readiness.info.value);
  const supportedBackends = supportedBackendSet(readiness.info.value);

  const models = catalogModels.length > 0
    ? catalogModels.map((model) => {
        const doctorModel = doctorByFilename.get(modelIdentity(model));
        return doctorModel ? { ...model, ...doctorModel } : model;
      })
    : doctorModels;

  return models.filter((model) =>
    isCatalogEntryForActivePlatform(model, platform) &&
    isInstallableModelPack(model, platform) &&
    isBackendSupported(model, supportedBackends) &&
    isUsableModelChoice(model)
  );
}

export function presetChoices(readiness: RuntimeReadiness | null): RuntimeCatalogEntry[] {
  if (!readiness || readiness.status === "error") {
    return [];
  }

  const platform = activePlatformFamily(readiness.info.value);
  const supportedBackends = supportedBackendSet(readiness.info.value);
  const usableModels = modelChoices(readiness);
  const usableModelByIdentity = new Map(
    usableModels
      .map((model) => [modelIdentity(model), model] as const)
      .filter(([identity]) => identity.length > 0)
  );
  const hasModelState =
    catalogEntries(readiness.models.value, "models").length > 0 ||
    doctorModelEntries(readiness.doctor.value).length > 0;

  return catalogEntries(readiness.presets.value, "presets").filter((preset) =>
    isCatalogEntryForActivePlatform(preset, platform) &&
    isPresetBackendSupported(preset, supportedBackends, usableModelByIdentity) &&
    isPresetModelUsable(preset, usableModelByIdentity, hasModelState)
  );
}

export function preferredPresetId(
  presets: RuntimeCatalogEntry[],
  savedPresetId: string | null | undefined
): string | null {
  const saved = stringField(savedPresetId);
  if (saved && presets.some((preset) => presetIdentity(preset) === saved)) {
    return saved;
  }

  const runtimeDefault = presets.find((preset) =>
    preset.default_for_windows === true || preset.default_for_macos === true
  );
  return presetIdentity(runtimeDefault ?? presets[0] ?? null) || null;
}

export function missingModelList(readiness: RuntimeReadiness | null): string[] {
  const modelsValue = readiness?.models.value;
  const doctorValue = readiness?.doctor.value;
  const platform = activePlatformFamily(readiness?.info.value);
  const entriesByIdentity = new Map(
    [
      ...catalogEntries(modelsValue, "models"),
      ...doctorModelEntries(doctorValue)
    ]
      .map((model) => [modelIdentity(model), model] as const)
      .filter(([identity]) => identity.length > 0)
  );
  const directMissing = modelMissingList(modelsValue);
  const missing = directMissing.length > 0 ? directMissing : doctorMissingList(doctorValue);
  return missing.filter((filename) =>
    isActionableMissingModel(filename, entriesByIdentity, platform)
  );
}

export function supportedTracks(readiness: RuntimeReadiness | null): string[] {
  const modelsValue = readiness?.models.value;
  if (isModelsCatalog(modelsValue) && Array.isArray(modelsValue.supported_tracks)) {
    return modelsValue.supported_tracks;
  }
  if (Array.isArray(readiness?.doctor.value?.supported_tracks)) {
    return readiness.doctor.value.supported_tracks;
  }
  if (Array.isArray(readiness?.info.value?.supported_tracks)) {
    return readiness.info.value.supported_tracks;
  }
  return uniqueStrings(
    catalogEntries(modelsValue, "models")
      .map((model) => stringField(model.screen_color))
      .filter(Boolean)
  );
}

export function doctorSummary(readiness: RuntimeReadiness | null): string | null {
  const summary = readiness?.doctor.value?.summary;
  if (!summary) return null;
  if (summary.healthy === false || summary.video_healthy === false) {
    return typeof summary.message === "string" && summary.message.length > 0
      ? summary.message
      : "Runtime prerequisites need attention";
  }
  if (typeof summary.message === "string" && summary.message.length > 0) {
    return summary.message;
  }
  if (summary.healthy === true && summary.video_healthy === true) {
    return "Runtime ready";
  }
  return null;
}

export function catalogEntries(
  value: RuntimeReadiness["models"]["value"] | RuntimeReadiness["presets"]["value"] | null | undefined,
  key: CatalogKey
): RuntimeCatalogEntry[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const entries = value[key];
  return Array.isArray(entries) ? (entries as RuntimeCatalogEntry[]) : [];
}

function doctorModelEntries(value: DoctorReport | null | undefined): RuntimeCatalogEntry[] {
  const models = value?.models;
  if (Array.isArray(models)) {
    return models;
  }
  if (isModelsCatalog(models)) {
    return catalogEntries(models, "models");
  }
  return [];
}

function isUsableModelChoice(model: RuntimeCatalogEntry): boolean {
  const artifactState = isRecord(model.artifact_state) ? model.artifact_state : null;
  const hasRuntimeState =
    "found" in model ||
    "usable" in model ||
    "path" in model ||
    artifactState !== null;

  if (!hasRuntimeState) {
    return false;
  }
  if (model.found === false || model.usable === false) {
    return false;
  }
  const artifactStatus = stringField(model.artifact_status);
  if (artifactStatus.length > 0 && artifactStatus !== "usable") {
    return false;
  }
  if (
    artifactState?.present === false ||
    artifactState?.packaged_for_active_track === false ||
    artifactState?.certified_for_active_track === false
  ) {
    return false;
  }
  return true;
}

function isCatalogEntryForActivePlatform(
  entry: RuntimeCatalogEntry,
  platform: PlatformFamily
): boolean {
  if (platform === "unknown") {
    return true;
  }

  const tags = [
    ...stringArrayField(entry.intended_platforms),
    ...stringArrayField(entry.validated_platforms)
  ];
  const hasPlatformSignal =
    tags.length > 0 ||
    typeof entry.default_for_windows === "boolean" ||
    typeof entry.default_for_macos === "boolean" ||
    typeof entry.packaged_for_windows === "boolean" ||
    typeof entry.packaged_for_macos === "boolean";

  if (!hasPlatformSignal) {
    return true;
  }

  if (platform === "windows") {
    return (
      entry.default_for_windows === true ||
      entry.packaged_for_windows === true ||
      tags.some((tag) => tagMatchesPlatform(tag, "windows"))
    );
  }

  return (
    entry.default_for_macos === true ||
    entry.packaged_for_macos === true ||
    tags.some((tag) => tagMatchesPlatform(tag, "macos"))
  );
}

function isPresetBackendSupported(
  preset: RuntimeCatalogEntry,
  supportedBackends: Set<string>,
  usableModelByIdentity: Map<string, RuntimeCatalogEntry>
): boolean {
  const presetBackend = stringField(preset.recommended_backend);
  if (presetBackend.length > 0) {
    return backendAllowed(presetBackend, supportedBackends);
  }

  const recommendedModel = stringField(preset.recommended_model);
  const modelBackend = stringField(usableModelByIdentity.get(recommendedModel)?.recommended_backend);
  return backendAllowed(modelBackend, supportedBackends);
}

function isPresetModelUsable(
  preset: RuntimeCatalogEntry,
  usableModelByIdentity: Map<string, RuntimeCatalogEntry>,
  hasModelState: boolean
): boolean {
  const recommendedModel = stringField(preset.recommended_model);
  if (recommendedModel.length === 0 || !hasModelState) {
    return true;
  }
  return usableModelByIdentity.has(recommendedModel);
}

function isBackendSupported(
  entry: RuntimeCatalogEntry,
  supportedBackends: Set<string>
): boolean {
  return backendAllowed(stringField(entry.recommended_backend), supportedBackends);
}

function backendAllowed(backend: string, supportedBackends: Set<string>): boolean {
  if (backend.length === 0 || supportedBackends.size === 0) {
    return true;
  }
  return supportedBackends.has(backend);
}

function supportedBackendSet(info: SystemInfo | null | undefined): Set<string> {
  const fromCapabilities = info?.capabilities?.supported_backends;
  if (Array.isArray(fromCapabilities) && fromCapabilities.length > 0) {
    return new Set(fromCapabilities.map((backend) => backend.toLowerCase()));
  }

  return new Set(
    (info?.devices ?? [])
      .map((device) => device.backend.toLowerCase())
      .filter(Boolean)
  );
}

function activePlatformFamily(info: SystemInfo | null | undefined): PlatformFamily {
  const platform = info?.capabilities?.platform?.toLowerCase() ?? "";
  if (platform.startsWith("windows")) return "windows";
  if (platform.startsWith("macos")) return "macos";
  return "unknown";
}

function tagMatchesPlatform(tag: string, platform: Exclude<PlatformFamily, "unknown">): boolean {
  const normalized = tag.toLowerCase();
  if (platform === "windows") {
    return normalized.startsWith("windows");
  }
  return normalized.startsWith("macos");
}

function modelIdentity(model: RuntimeCatalogEntry): string {
  return (
    stringField(model.filename) ||
    stringField(model.id) ||
    stringField(model.name) ||
    stringField(model.path)
  );
}

function presetIdentity(preset: RuntimeCatalogEntry | null): string {
  return stringField(preset?.id) || stringField(preset?.name);
}

function isActionableMissingModel(
  filename: string,
  entriesByIdentity: Map<string, RuntimeCatalogEntry>,
  platform: PlatformFamily
): boolean {
  const entry = entriesByIdentity.get(filename);
  if (entry) {
    return isInstallableModelPack(entry, platform);
  }
  return !isRetiredReferenceArtifact(filename);
}

function isInstallableModelPack(entry: RuntimeCatalogEntry, platform: PlatformFamily): boolean {
  if (entry.installable_model_pack === false) {
    return false;
  }

  if (isReferenceValidationEntry(entry)) {
    return false;
  }

  const artifactState = isRecord(entry.artifact_state) ? entry.artifact_state : null;
  if (artifactState?.packaged_for_active_track === false) {
    return false;
  }

  if (platform === "windows") {
    return entry.packaged_for_windows ?? entry.installable_model_pack ?? true;
  }
  if (platform === "macos") {
    return entry.packaged_for_macos ?? entry.installable_model_pack ?? true;
  }
  return entry.installable_model_pack ?? true;
}

function isReferenceValidationEntry(entry: RuntimeCatalogEntry): boolean {
  const filename = modelIdentity(entry);
  return (
    stringField(entry.intended_use) === "reference_validation" ||
    isRetiredReferenceArtifact(filename)
  );
}

function isRetiredReferenceArtifact(filename: string): boolean {
  return (
    filename === "corridorkey_fp16_768.onnx" ||
    /^corridorkey_fp32_\d+\.onnx$/i.test(filename)
  );
}

function modelMissingList(
  value: RuntimeModelsCatalog | RuntimeCatalogEntry[] | null | undefined
): string[] {
  if (!isModelsCatalog(value) || !Array.isArray(value.missing_models)) {
    return [];
  }
  return value.missing_models;
}

function doctorMissingList(value: DoctorReport | null | undefined): string[] {
  const models = value?.models;
  if (Array.isArray(models)) {
    return models
      .filter((model) => model.found === false || model.usable === false)
      .map((model) =>
        stringField(model.filename) ||
        stringField(model.name) ||
        stringField(model.id) ||
        stringField(model.path)
      )
      .filter(Boolean);
  }

  const missing = models?.missing_models;
  return Array.isArray(missing) ? missing : [];
}

function isModelsCatalog(
  value: RuntimeModelsCatalog | RuntimeCatalogEntry[] | null | undefined
): value is RuntimeModelsCatalog {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringArrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}
