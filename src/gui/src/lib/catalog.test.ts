import { describe, expect, test } from "vitest";
import type { RuntimeCatalogEntry, RuntimeReadiness, SystemInfo } from "@/lib/engine";
import { missingModelList, modelChoices, preferredPresetId, presetChoices } from "@/lib/catalog";

const windowsInfo: SystemInfo = {
  active_device: {
    backend: "tensorrt",
    memory_mb: 10051,
    name: "NVIDIA GeForce RTX 3080 (TensorRT)"
  },
  capabilities: {
    platform: "windows",
    supported_backends: ["tensorrt", "torchtrt", "cpu"]
  },
  devices: [
    {
      backend: "tensorrt",
      memory_mb: 10051,
      name: "NVIDIA GeForce RTX 3080 (TensorRT)"
    }
  ],
  supported_tracks: ["green", "blue"]
};

describe("runtime catalog choices", () => {
  test("model choices keep loaded models for the active Windows RTX track", () => {
    const readiness = readinessWith({
      info: windowsInfo,
      models: [macMlx(), windowsModel("corridorkey_fp16_1024.onnx"), windowsModel("corridorkey_fp16_2048.onnx"), referenceCpu()],
      doctorModels: [
        doctorModel(macMlx(), {
          certifiedForActiveDevice: false,
          packagedForActiveTrack: false
        }),
        doctorModel(windowsModel("corridorkey_fp16_1024.onnx")),
        doctorModel(windowsModel("corridorkey_fp16_2048.onnx"), {
          certifiedForActiveDevice: false
        }),
        doctorModel(referenceCpu(), {
          found: false,
          usable: false
        })
      ],
      presets: []
    });

    const filenames = modelChoices(readiness).map((model) => model.filename);

    expect(filenames).toEqual(["corridorkey_fp16_1024.onnx", "corridorkey_fp16_2048.onnx"]);
  });

  test("preset choices reject Mac presets and keep loaded Windows presets", () => {
    const readiness = readinessWith({
      info: windowsInfo,
      models: [
        macMlx(),
        windowsModel("corridorkey_fp16_512.onnx"),
        windowsModel("corridorkey_fp16_1024.onnx"),
        windowsModel("corridorkey_fp16_2048.onnx")
      ],
      doctorModels: [
        doctorModel(macMlx(), {
          certifiedForActiveDevice: false,
          packagedForActiveTrack: false
        }),
        doctorModel(windowsModel("corridorkey_fp16_512.onnx")),
        doctorModel(windowsModel("corridorkey_fp16_1024.onnx")),
        doctorModel(windowsModel("corridorkey_fp16_2048.onnx"), {
          certifiedForActiveDevice: false
        })
      ],
      presets: [
        macPreset("mac-balanced", "Mac Balanced"),
        windowsPreset("win-rtx-draft", "Windows RTX Draft", "corridorkey_fp16_512.onnx"),
        windowsPreset("win-rtx-balanced", "Windows RTX Balanced", "corridorkey_fp16_1024.onnx"),
        windowsPreset("win-rtx-max-quality", "Windows RTX Max Quality", "corridorkey_fp16_1024.onnx"),
        windowsPreset("win-rtx-ultra-quality", "Windows RTX Ultra Quality", "corridorkey_fp16_2048.onnx"),
        macPreset("mac-ultra-quality", "Mac Ultra Quality")
      ]
    });

    const names = presetChoices(readiness).map((preset) => preset.name);

    expect(names).toEqual([
      "Windows RTX Draft",
      "Windows RTX Balanced",
      "Windows RTX Max Quality",
      "Windows RTX Ultra Quality"
    ]);
  });

  test("preferred preset restores a valid saved id before falling back to runtime default", () => {
    const presets = [
      { ...windowsPreset("win-rtx-balanced", "Windows RTX Balanced", "corridorkey_fp16_1024.onnx"), default_for_windows: false },
      windowsPreset("win-rtx-draft", "Windows RTX Draft", "corridorkey_fp16_512.onnx"),
      { ...windowsPreset("win-rtx-ultra-quality", "Windows RTX Ultra Quality", "corridorkey_fp16_2048.onnx"), default_for_windows: false }
    ];

    expect(preferredPresetId(presets, "win-rtx-ultra-quality")).toBe("win-rtx-ultra-quality");
    expect(preferredPresetId(presets, "missing-preset")).toBe("win-rtx-draft");
    expect(preferredPresetId([], "win-rtx-draft")).toBeNull();
  });

  test("degraded Windows readiness still keeps compatible loaded presets", () => {
    const readiness = readinessWith({
      status: "degraded",
      info: windowsInfo,
      models: [
        macMlx(),
        windowsModel("corridorkey_fp16_512.onnx"),
        windowsModel("corridorkey_fp16_1024.onnx"),
        windowsModel("corridorkey_fp16_1536.onnx"),
        windowsModel("corridorkey_fp16_2048.onnx"),
        windowsModel("corridorkey_dynamic_blue_fp16.ts", "torchtrt"),
        referenceCpu()
      ],
      doctorModels: [
        doctorModel(macMlx(), {
          certifiedForActiveDevice: false,
          packagedForActiveTrack: false
        }),
        doctorModel(windowsModel("corridorkey_fp16_512.onnx")),
        doctorModel(windowsModel("corridorkey_fp16_1024.onnx")),
        doctorModel(windowsModel("corridorkey_fp16_1536.onnx"), {
          certifiedForActiveDevice: false
        }),
        doctorModel(windowsModel("corridorkey_fp16_2048.onnx"), {
          certifiedForActiveDevice: false
        }),
        doctorModel(windowsModel("corridorkey_dynamic_blue_fp16.ts", "torchtrt")),
        doctorModel(referenceCpu(), {
          found: false,
          usable: false
        })
      ],
      presets: [
        macPreset("mac-balanced", "Mac Balanced"),
        windowsPreset("win-rtx-balanced", "Windows RTX Balanced", "corridorkey_fp16_1024.onnx"),
        windowsPreset("win-rtx-max-quality", "Windows RTX Max Quality", "corridorkey_fp16_1024.onnx"),
        windowsPreset("win-rtx-ultra-quality", "Windows RTX Ultra Quality", "corridorkey_fp16_2048.onnx"),
        macPreset("mac-ultra-quality", "Mac Ultra Quality")
      ]
    });

    expect(presetChoices(readiness).map((preset) => preset.name)).toEqual([
      "Windows RTX Balanced",
      "Windows RTX Max Quality",
      "Windows RTX Ultra Quality"
    ]);
  });

  test("preset choices hide a Windows preset when its recommended model pack is missing", () => {
    const readiness = readinessWith({
      info: windowsInfo,
      models: [windowsModel("corridorkey_fp16_1024.onnx")],
      doctorModels: [
        doctorModel(windowsModel("corridorkey_fp16_1024.onnx"), {
          found: false,
          usable: false
        })
      ],
      presets: [
        windowsPreset("win-rtx-balanced", "Windows RTX Balanced", "corridorkey_fp16_1024.onnx")
      ]
    });

    expect(presetChoices(readiness)).toEqual([]);
  });

  test("untagged fake-runtime catalog entries remain visible when their backend is supported", () => {
    const readiness = readinessWith({
      info: windowsInfo,
      models: [
        {
          filename: "fake-green.onnx",
          name: "Fake Green",
          recommended_backend: "tensorrt"
        }
      ],
      doctorModels: [
        doctorModel({
          filename: "fake-green.onnx",
          name: "Fake Green",
          recommended_backend: "tensorrt"
        })
      ],
      presets: [
        {
          id: "fake",
          name: "Fake Preset",
          recommended_model: "fake-green.onnx"
        }
      ]
    });

    expect(modelChoices(readiness).map((model) => model.filename)).toEqual(["fake-green.onnx"]);
    expect(presetChoices(readiness).map((preset) => preset.name)).toEqual(["Fake Preset"]);
  });

  test("model choices hide present reference-validation artifacts", () => {
    const readiness = readinessWith({
      info: windowsInfo,
      models: [
        windowsModel("corridorkey_fp16_1024.onnx"),
        referenceWindowsModel("corridorkey_fp16_768.onnx"),
        {
          ...referenceCpu(),
          installable_model_pack: false
        }
      ],
      doctorModels: [
        doctorModel(windowsModel("corridorkey_fp16_1024.onnx")),
        doctorModel(referenceWindowsModel("corridorkey_fp16_768.onnx")),
        doctorModel({
          ...referenceCpu(),
          installable_model_pack: false
        })
      ],
      presets: []
    });

    expect(modelChoices(readiness).map((model) => model.filename)).toEqual([
      "corridorkey_fp16_1024.onnx"
    ]);
  });

  test("missing model packs exclude reference-validation artifacts", () => {
    const readiness = readinessWith({
      status: "degraded",
      info: windowsInfo,
      models: [
        windowsModel("corridorkey_dynamic_blue_fp16.ts", "torchtrt"),
        referenceWindowsModel("corridorkey_fp16_768.onnx"),
        referenceCpu()
      ],
      modelMissing: [
        "corridorkey_fp16_768.onnx",
        "corridorkey_fp32_1024.onnx",
        "corridorkey_dynamic_blue_fp16.ts"
      ],
      doctorModels: [
        doctorModel(windowsModel("corridorkey_dynamic_blue_fp16.ts", "torchtrt"), {
          found: false,
          usable: false
        }),
        doctorModel(referenceWindowsModel("corridorkey_fp16_768.onnx"), {
          found: false,
          packagedForActiveTrack: false,
          usable: false
        }),
        doctorModel(referenceCpu(), {
          found: false,
          packagedForActiveTrack: false,
          usable: false
        })
      ],
      presets: []
    });

    expect(missingModelList(readiness)).toEqual(["corridorkey_dynamic_blue_fp16.ts"]);
  });

  test("missing model packs honor runtime installable model-pack contract", () => {
    const readiness = readinessWith({
      status: "degraded",
      info: windowsInfo,
      models: [
        {
          filename: "corridorkey_experimental_probe.onnx",
          installable_model_pack: false,
          recommended_backend: "tensorrt"
        },
        {
          filename: "corridorkey_future_green_fp16.onnx",
          installable_model_pack: true,
          recommended_backend: "tensorrt"
        }
      ],
      modelMissing: [
        "corridorkey_experimental_probe.onnx",
        "corridorkey_future_green_fp16.onnx"
      ],
      doctorModels: [],
      presets: []
    });

    expect(missingModelList(readiness)).toEqual(["corridorkey_future_green_fp16.onnx"]);
  });
});

function readinessWith({
  status = "ready",
  info,
  models,
  modelMissing = [],
  doctorModels,
  presets
}: {
  status?: RuntimeReadiness["status"];
  info: SystemInfo;
  models: RuntimeCatalogEntry[];
  modelMissing?: string[];
  doctorModels: RuntimeCatalogEntry[];
  presets: RuntimeCatalogEntry[];
}): RuntimeReadiness {
  return {
    status,
    runtime_path: "C:\\CorridorKey\\ck-engine.exe",
    searched_roots: [],
    info: {
      command: "info",
      ok: true,
      value: info,
      error: null
    },
    doctor: {
      command: "doctor",
      ok: true,
      value: {
        summary: {
          healthy: true,
          video_healthy: true,
          message: "Runtime ready"
        },
        models: doctorModels,
        supported_tracks: ["green", "blue"]
      },
      error: null
    },
    models: {
      command: "models",
      ok: true,
      value: {
        missing_models: modelMissing,
        missing_count: modelMissing.length,
        models,
        supported_tracks: ["green", "blue"]
      },
      error: null
    },
    presets: {
      command: "presets",
      ok: true,
      value: {
        presets
      },
      error: null
    }
  };
}

function macMlx(): RuntimeCatalogEntry {
  return {
    filename: "corridorkey_mlx.safetensors",
    intended_platforms: ["macos_apple_silicon"],
    packaged_for_macos: true,
    packaged_for_windows: false,
    recommended_backend: "mlx"
  };
}

function windowsModel(filename: string, recommendedBackend = "tensorrt"): RuntimeCatalogEntry {
  return {
    filename,
    intended_platforms: ["windows_rtx_30_plus"],
    packaged_for_macos: false,
    packaged_for_windows: true,
    recommended_backend: recommendedBackend
  };
}

function referenceCpu(): RuntimeCatalogEntry {
  return {
    filename: "corridorkey_fp32_1024.onnx",
    intended_platforms: ["macos_apple_silicon", "windows_rtx"],
    packaged_for_macos: false,
    packaged_for_windows: false,
    recommended_backend: "cpu"
  };
}

function referenceWindowsModel(filename: string): RuntimeCatalogEntry {
  return {
    filename,
    intended_platforms: ["windows_rtx_30_plus"],
    intended_use: "reference_validation",
    packaged_for_macos: false,
    packaged_for_windows: false,
    recommended_backend: "tensorrt"
  };
}

function doctorModel(
  model: RuntimeCatalogEntry,
  overrides: {
    certifiedForActiveDevice?: boolean;
    found?: boolean;
    packagedForActiveTrack?: boolean;
    usable?: boolean;
  } = {}
): RuntimeCatalogEntry {
  const found = overrides.found ?? true;
  const usable = overrides.usable ?? found;
  const certifiedForActiveDevice = overrides.certifiedForActiveDevice ?? true;
  const packagedForActiveTrack = overrides.packagedForActiveTrack ?? true;

  return {
    ...model,
    artifact_state: {
      certified_for_active_device: certifiedForActiveDevice,
      certified_for_active_track: packagedForActiveTrack,
      packaged_for_active_track: packagedForActiveTrack,
      present: found
    },
    artifact_status: usable ? "usable" : "missing",
    found,
    path: `models\\${model.filename}`,
    usable
  };
}

function macPreset(id: string, name: string): RuntimeCatalogEntry {
  return {
    default_for_macos: id === "mac-balanced",
    default_for_windows: false,
    id,
    intended_platforms: ["macos_apple_silicon"],
    name,
    recommended_model: "corridorkey_mlx.safetensors",
    validated_platforms: ["macos_apple_silicon"]
  };
}

function windowsPreset(
  id: string,
  name: string,
  recommendedModel: string
): RuntimeCatalogEntry {
  return {
    default_for_macos: false,
    default_for_windows: id === "win-rtx-draft",
    id,
    intended_platforms: ["windows_rtx_30_plus"],
    name,
    recommended_model: recommendedModel,
    validated_platforms: ["windows_rtx_30_plus"]
  };
}
