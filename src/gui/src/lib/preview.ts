import { invoke } from "@tauri-apps/api/core";

export interface PreviewProxy {
  source_path: string;
  path: string;
  reused: boolean;
}

export type SourceAssetSelectionMode = "file" | "folder";

export async function selectSourceAsset(
  mode: SourceAssetSelectionMode
): Promise<string | null> {
  return await invoke<string | null>("select_source_asset", { mode });
}

export async function selectAlphaHintAsset(): Promise<string | null> {
  return await invoke<string | null>("select_alpha_hint_asset");
}

export async function createPreviewProxy(source: string): Promise<PreviewProxy> {
  return await invoke<PreviewProxy>("create_preview_proxy", { source });
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
