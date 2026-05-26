import { invoke } from "@tauri-apps/api/core";

export interface PreviewProxy {
  source_path: string;
  path: string;
  reused: boolean;
}

export async function createPreviewProxy(source: string): Promise<PreviewProxy> {
  return await invoke<PreviewProxy>("create_preview_proxy", { source });
}

export async function allowPreviewAsset(path: string): Promise<void> {
  await invoke("allow_preview_asset", { path });
}

export function formatPreviewError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }
  return String(error);
}
