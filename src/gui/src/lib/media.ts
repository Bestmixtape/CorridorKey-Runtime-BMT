export type PreviewKind = "video" | "image" | "unsupported";

const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "webm", "mkv", "avi"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

export function fileName(path: string | null | undefined): string {
  if (!path) return "";
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

export function fileExtension(path: string | null | undefined): string {
  const name = fileName(path).toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1) : "";
}

export function hasFileExtension(path: string | null | undefined): boolean {
  return fileExtension(path).length > 0;
}

export function previewKindForPath(path: string): PreviewKind {
  const extension = fileExtension(path);
  if (VIDEO_EXTENSIONS.has(extension)) return "video";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return "unsupported";
}

export function suggestOutputPath(
  inputPath: string | null,
  currentOutputPath: string | null,
  defaultOutputDir: string | null
): string | null {
  if (!inputPath || (currentOutputPath && hasFileExtension(currentOutputPath))) {
    return null;
  }

  const directory = defaultOutputDir || currentOutputPath;
  if (!directory) {
    return null;
  }

  const inputBase = fileName(inputPath).replace(/\.[^.]+$/, "") || "corridorkey_output";
  return joinLocalPath(directory, `${inputBase}_corridorkey.mov`);
}

function joinLocalPath(directory: string, file: string): string {
  const trimmed = directory.replace(/[\\/]+$/, "");
  const separator = directory.includes("\\") ? "\\" : "/";
  return `${trimmed}${separator}${file}`;
}
