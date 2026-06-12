import { beforeEach, describe, expect, test, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { createPreviewProxy, selectAlphaHintAsset, selectSourceAsset } from "@/lib/preview";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn()
}));

const invokeMock = vi.mocked(invoke);

describe("preview native commands", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  test("selects source assets through the native scoped picker", async () => {
    invokeMock.mockResolvedValueOnce("C:\\Shots\\plate.mov");

    await expect(selectSourceAsset("file")).resolves.toBe("C:\\Shots\\plate.mov");

    expect(invokeMock).toHaveBeenCalledWith("select_source_asset", { mode: "file" });
  });

  test("selects source folders through the native scoped picker", async () => {
    invokeMock.mockResolvedValueOnce("C:\\Shots\\sequence");

    await expect(selectSourceAsset("folder")).resolves.toBe("C:\\Shots\\sequence");

    expect(invokeMock).toHaveBeenCalledWith("select_source_asset", { mode: "folder" });
  });

  test("selects alpha hints through the native scoped picker", async () => {
    invokeMock.mockResolvedValueOnce("C:\\Shots\\hint.mov");

    await expect(selectAlphaHintAsset()).resolves.toBe("C:\\Shots\\hint.mov");

    expect(invokeMock).toHaveBeenCalledWith("select_alpha_hint_asset");
  });

  test("creates preview proxies without exposing a generic allow command", async () => {
    invokeMock.mockResolvedValueOnce({
      source_path: "C:\\Shots\\result.mov",
      path: "C:\\Cache\\result.mp4",
      reused: false
    });

    await expect(createPreviewProxy("C:\\Shots\\result.mov")).resolves.toEqual({
      source_path: "C:\\Shots\\result.mov",
      path: "C:\\Cache\\result.mp4",
      reused: false
    });

    expect(invokeMock).toHaveBeenCalledWith("create_preview_proxy", {
      source: "C:\\Shots\\result.mov"
    });
  });
});
