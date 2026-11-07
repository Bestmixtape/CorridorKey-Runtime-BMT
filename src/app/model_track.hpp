#pragma once

// BMT Build: model precision track switch (FP32 default / FP16 experimental).
//
// Upstream HF ground truth (alexandrealvaro/CorridorKey, revision main,
// api tree listing 2026-11): the ONLY fp32 artifacts published are
// torchtrt/fp32-blue/corridorkey_blue_torchtrt_fp32_1536.ts; there are no
// green fp32 .ts/.onnx files (torchtrt/fp32/ 404s). The fp32 track therefore
// means: blue screens load the dedicated blue FP32 artifact (blue FP16
// NaNs in LayerNorm/Softmax at 1536+ per src/core/torch_trt_session.cpp),
// green prefers a staged corridorkey_torchtrt_fp32_<res>.ts when present
// (the 3090 "fp32 hack" staging path, loaded via generic TorchScript with
// infer_input_dtype() picking kFloat32 from the filename) and falls back to
// the published fp16 green artifacts otherwise.
//
// Precedence (user steer): env CORRIDORKEY_MODEL_TRACK > explicit caller
// value (OFX panel param / CLI --track) > default fp32.

#include <cstdlib>
#include <optional>
#include <string_view>

namespace corridorkey::app {

enum class ModelTrack { Fp32, Fp16 };

inline constexpr const char* kModelTrackEnvVar = "CORRIDORKEY_MODEL_TRACK";

inline const char* model_track_name(ModelTrack track) {
    return track == ModelTrack::Fp16 ? "fp16" : "fp32";
}

inline std::optional<ModelTrack> model_track_from_name(std::string_view name) {
    if (name == "fp32") {
        return ModelTrack::Fp32;
    }
    if (name == "fp16") {
        return ModelTrack::Fp16;
    }
    return std::nullopt;
}

// Env override, when set and valid. Wins over every caller-supplied value.
inline std::optional<ModelTrack> model_track_env_override() {
    const char* raw = std::getenv(kModelTrackEnvVar);
    if (raw == nullptr) {
        return std::nullopt;
    }
    return model_track_from_name(raw);
}

// Full precedence chain. explicit_track carries the panel-param / CLI value.
inline ModelTrack resolve_model_track(std::optional<std::string_view> explicit_track = std::nullopt) {
    if (const auto env = model_track_env_override(); env.has_value()) {
        return *env;
    }
    if (explicit_track.has_value()) {
        if (const auto parsed = model_track_from_name(*explicit_track); parsed.has_value()) {
            return *parsed;
        }
    }
    return ModelTrack::Fp32;
}

}  // namespace corridorkey::app
