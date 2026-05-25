use serde::Serialize;
use serde_json::{json, Value};
use std::env;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const RUNTIME_PATH_ENV: &str = "CORRIDORKEY_GUI_RUNTIME_PATH";

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum RuntimeReadinessStatus {
    Ready,
    Degraded,
    Error,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
enum RuntimeCommandErrorKind {
    MissingRuntime,
    SpawnFailed,
    NonZeroExit,
    InvalidJson,
    PrerequisiteFailed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
struct RuntimeCommandError {
    kind: RuntimeCommandErrorKind,
    command: String,
    message: String,
    stderr: Option<String>,
    stdout: Option<String>,
    exit_code: Option<i32>,
}

#[derive(Clone, Debug, Serialize)]
struct RuntimeCommandResult {
    command: String,
    ok: bool,
    value: Option<Value>,
    error: Option<RuntimeCommandError>,
}

#[derive(Clone, Debug, Serialize)]
struct RuntimeReadiness {
    status: RuntimeReadinessStatus,
    runtime_path: Option<String>,
    searched_roots: Vec<String>,
    info: RuntimeCommandResult,
    doctor: RuntimeCommandResult,
    models: RuntimeCommandResult,
    presets: RuntimeCommandResult,
}

struct EnginePathResolution {
    path: Option<PathBuf>,
    searched_roots: Vec<PathBuf>,
    error: Option<RuntimeCommandError>,
}

#[cfg(target_os = "windows")]
fn engine_binary_name() -> &'static str {
    "ck-engine.exe"
}

#[cfg(not(target_os = "windows"))]
fn engine_binary_name() -> &'static str {
    "corridorkey"
}

fn path_to_string(path: &Path) -> String {
    path.display().to_string()
}

fn push_runtime_root(runtime_roots: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !runtime_roots.iter().any(|root| root == &candidate) {
        runtime_roots.push(candidate);
    }
}

fn candidate_runtime_roots(exe_dir: &Path, resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut runtime_roots: Vec<PathBuf> = Vec::new();

    push_runtime_root(&mut runtime_roots, exe_dir.to_path_buf());
    push_runtime_root(&mut runtime_roots, exe_dir.join("runtime"));
    push_runtime_root(&mut runtime_roots, exe_dir.join("resources"));
    push_runtime_root(
        &mut runtime_roots,
        exe_dir.join("resources").join("runtime"),
    );

    if let Some(resource_dir) = resource_dir {
        push_runtime_root(&mut runtime_roots, resource_dir.to_path_buf());
        push_runtime_root(&mut runtime_roots, resource_dir.join("runtime"));
        push_runtime_root(&mut runtime_roots, resource_dir.join("resources"));
        push_runtime_root(
            &mut runtime_roots,
            resource_dir.join("resources").join("runtime"),
        );
    }

    runtime_roots
}

fn runtime_command_error(
    kind: RuntimeCommandErrorKind,
    command: &str,
    message: impl Into<String>,
) -> RuntimeCommandError {
    RuntimeCommandError {
        kind,
        command: command.to_string(),
        message: message.into(),
        stderr: None,
        stdout: None,
        exit_code: None,
    }
}

fn command_failure(command: &str, error: RuntimeCommandError) -> RuntimeCommandResult {
    RuntimeCommandResult {
        command: command.to_string(),
        ok: false,
        value: None,
        error: Some(error),
    }
}

fn command_success(command: &str, value: Value) -> RuntimeCommandResult {
    RuntimeCommandResult {
        command: command.to_string(),
        ok: true,
        value: Some(value),
        error: None,
    }
}

fn missing_runtime_result(command: &str, error: &RuntimeCommandError) -> RuntimeCommandResult {
    let mut command_error = error.clone();
    command_error.command = command.to_string();
    command_failure(command, command_error)
}

#[cfg(any(test, debug_assertions))]
fn override_engine_path() -> Option<PathBuf> {
    let raw_path = env::var_os(RUNTIME_PATH_ENV)?;
    let path = PathBuf::from(raw_path);
    if path.is_dir() {
        Some(path.join(engine_binary_name()))
    } else {
        Some(path)
    }
}

#[cfg(not(any(test, debug_assertions)))]
fn override_engine_path() -> Option<PathBuf> {
    None
}

fn resolve_engine_path(app: Option<&AppHandle>) -> EnginePathResolution {
    if let Some(override_path) = override_engine_path() {
        if override_path.is_file() {
            return EnginePathResolution {
                path: Some(override_path.clone()),
                searched_roots: vec![override_path],
                error: None,
            };
        }

        return EnginePathResolution {
            path: None,
            searched_roots: vec![override_path.clone()],
            error: Some(runtime_command_error(
                RuntimeCommandErrorKind::MissingRuntime,
                "runtime",
                format!(
                    "Runtime override does not point to an executable file: {}",
                    override_path.display()
                ),
            )),
        };
    }

    let mut exe_dir = match env::current_exe() {
        Ok(path) => path,
        Err(error) => {
            return EnginePathResolution {
                path: None,
                searched_roots: Vec::new(),
                error: Some(runtime_command_error(
                    RuntimeCommandErrorKind::PrerequisiteFailed,
                    "runtime",
                    format!("Failed to get current executable path: {error}"),
                )),
            };
        }
    };
    exe_dir.pop();

    let resource_dir = app.and_then(|app_handle| app_handle.path().resource_dir().ok());
    let runtime_roots = candidate_runtime_roots(&exe_dir, resource_dir.as_deref());

    for runtime_root in &runtime_roots {
        let candidate = runtime_root.join(engine_binary_name());
        if candidate.is_file() {
            return EnginePathResolution {
                path: Some(candidate),
                searched_roots: runtime_roots,
                error: None,
            };
        }
    }

    let searched_roots = runtime_roots
        .iter()
        .map(|root| root.display().to_string())
        .collect::<Vec<_>>()
        .join("; ");

    EnginePathResolution {
        path: None,
        searched_roots: runtime_roots,
        error: Some(runtime_command_error(
            RuntimeCommandErrorKind::MissingRuntime,
            "runtime",
            format!(
                "Engine binary not found. Looked for {} under: {}",
                engine_binary_name(),
                searched_roots
            ),
        )),
    }
}

fn get_engine_path(app: Option<&AppHandle>) -> Result<PathBuf, RuntimeCommandError> {
    let resolution = resolve_engine_path(app);
    resolution.path.ok_or_else(|| {
        resolution.error.unwrap_or_else(|| {
            runtime_command_error(
                RuntimeCommandErrorKind::MissingRuntime,
                "runtime",
                "Engine binary not found.",
            )
        })
    })
}

fn run_runtime_json(engine_path: &Path, command_name: &str) -> RuntimeCommandResult {
    if !engine_path.is_file() {
        return command_failure(
            command_name,
            runtime_command_error(
                RuntimeCommandErrorKind::MissingRuntime,
                command_name,
                format!("Runtime binary is missing: {}", engine_path.display()),
            ),
        );
    }

    let Some(current_dir) = engine_path.parent() else {
        return command_failure(
            command_name,
            runtime_command_error(
                RuntimeCommandErrorKind::PrerequisiteFailed,
                command_name,
                format!(
                    "Runtime binary has no parent directory: {}",
                    engine_path.display()
                ),
            ),
        );
    };

    let mut command = Command::new(engine_path);
    command
        .args([command_name, "--json"])
        .current_dir(current_dir);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let output = match command.output() {
        Ok(output) => output,
        Err(error) => {
            return command_failure(
                command_name,
                runtime_command_error(
                    RuntimeCommandErrorKind::SpawnFailed,
                    command_name,
                    format!("Could not start {}: {error}", engine_path.display()),
                ),
            );
        }
    };

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let mut error = runtime_command_error(
            RuntimeCommandErrorKind::NonZeroExit,
            command_name,
            format!(
                "Runtime command `{}` exited with status {}.",
                command_name, output.status
            ),
        );
        error.stderr = (!stderr.trim().is_empty()).then_some(stderr);
        error.stdout = (!stdout.trim().is_empty()).then_some(stdout);
        error.exit_code = output.status.code();
        return command_failure(command_name, error);
    }

    match serde_json::from_str::<Value>(&stdout) {
        Ok(value) => command_success(command_name, value),
        Err(parse_error) => {
            let mut error = runtime_command_error(
                RuntimeCommandErrorKind::InvalidJson,
                command_name,
                format!("Runtime command `{command_name}` returned invalid JSON: {parse_error}"),
            );
            error.stdout = Some(stdout);
            error.stderr = (!stderr.trim().is_empty()).then_some(stderr);
            command_failure(command_name, error)
        }
    }
}

fn json_bool_at<'a>(value: &'a Value, path: &[&str]) -> Option<bool> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    current.as_bool()
}

fn json_count_at<'a>(value: &'a Value, path: &[&str]) -> Option<u64> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    current.as_u64()
}

fn has_missing_models(models: &RuntimeCommandResult, doctor: &RuntimeCommandResult) -> bool {
    let direct_missing = models
        .value
        .as_ref()
        .and_then(|value| json_count_at(value, &["missing_count"]))
        .unwrap_or(0);
    let doctor_missing = doctor
        .value
        .as_ref()
        .and_then(|value| json_count_at(value, &["models", "missing_count"]))
        .unwrap_or(0);

    direct_missing > 0 || doctor_missing > 0
}

fn doctor_reports_unhealthy(doctor: &RuntimeCommandResult) -> bool {
    doctor.value.as_ref().is_some_and(|value| {
        json_bool_at(value, &["summary", "healthy"]) == Some(false)
            || json_bool_at(value, &["summary", "video_healthy"]) == Some(false)
    })
}

fn readiness_status(
    info: &RuntimeCommandResult,
    doctor: &RuntimeCommandResult,
    models: &RuntimeCommandResult,
    presets: &RuntimeCommandResult,
) -> RuntimeReadinessStatus {
    if [&info, &doctor, &models, &presets]
        .iter()
        .any(|result| !result.ok)
    {
        return RuntimeReadinessStatus::Error;
    }

    if doctor_reports_unhealthy(doctor) || has_missing_models(models, doctor) {
        return RuntimeReadinessStatus::Degraded;
    }

    RuntimeReadinessStatus::Ready
}

fn collect_runtime_readiness_for_path(
    engine_path: &Path,
    searched_roots: Vec<PathBuf>,
) -> RuntimeReadiness {
    let info = run_runtime_json(engine_path, "info");
    let doctor = run_runtime_json(engine_path, "doctor");
    let models = run_runtime_json(engine_path, "models");
    let presets = run_runtime_json(engine_path, "presets");
    let status = readiness_status(&info, &doctor, &models, &presets);

    RuntimeReadiness {
        status,
        runtime_path: Some(path_to_string(engine_path)),
        searched_roots: searched_roots
            .iter()
            .map(|root| path_to_string(root))
            .collect(),
        info,
        doctor,
        models,
        presets,
    }
}

fn collect_runtime_readiness(app: Option<&AppHandle>) -> RuntimeReadiness {
    let resolution = resolve_engine_path(app);
    let searched_roots = resolution
        .searched_roots
        .iter()
        .map(|root| path_to_string(root))
        .collect::<Vec<_>>();

    if let Some(engine_path) = resolution.path {
        return collect_runtime_readiness_for_path(&engine_path, resolution.searched_roots);
    }

    let error = resolution.error.unwrap_or_else(|| {
        runtime_command_error(
            RuntimeCommandErrorKind::MissingRuntime,
            "runtime",
            "Engine binary not found.",
        )
    });

    RuntimeReadiness {
        status: RuntimeReadinessStatus::Error,
        runtime_path: None,
        searched_roots,
        info: missing_runtime_result("info", &error),
        doctor: missing_runtime_result("doctor", &error),
        models: missing_runtime_result("models", &error),
        presets: missing_runtime_result("presets", &error),
    }
}

fn resolve_selected_model_path(
    engine_path: &Path,
    selected_model: &str,
) -> Result<PathBuf, RuntimeCommandError> {
    let model_path = PathBuf::from(selected_model);
    if model_path.is_absolute() {
        return Ok(model_path);
    }

    let engine_dir = engine_path.parent().ok_or_else(|| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "process",
            format!(
                "Runtime binary has no parent directory: {}",
                engine_path.display()
            ),
        )
    })?;

    let has_parent = model_path
        .parent()
        .is_some_and(|parent| !parent.as_os_str().is_empty());
    if has_parent {
        Ok(engine_dir.join(model_path))
    } else {
        Ok(engine_dir.join("models").join(model_path))
    }
}

fn emit_failed_process_event(app: &AppHandle, message: impl Into<String>) {
    let payload = json!({
        "type": "failed",
        "message": message.into(),
    });
    let _ = app.emit("engine-event", payload.to_string());
}

#[tauri::command]
async fn get_runtime_readiness(app: AppHandle) -> RuntimeReadiness {
    collect_runtime_readiness(Some(&app))
}

#[tauri::command]
async fn start_processing(
    app: AppHandle,
    input: String,
    output: String,
    hint: Option<String>,
    preset: Option<String>,
    model: Option<String>,
    video_encode: Option<String>,
) -> Result<(), RuntimeCommandError> {
    let engine_path = get_engine_path(Some(&app))?;
    let current_dir = engine_path.parent().ok_or_else(|| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "process",
            format!(
                "Runtime binary has no parent directory: {}",
                engine_path.display()
            ),
        )
    })?;

    let mut args = vec![
        "process".to_string(),
        "--input".to_string(),
        input,
        "--output".to_string(),
        output,
        "--json".to_string(),
    ];

    if let Some(h) = hint {
        if !h.is_empty() {
            args.push("--alpha-hint".to_string());
            args.push(h);
        }
    }

    if let Some(selected_preset) = preset {
        if !selected_preset.is_empty() {
            args.push("--preset".to_string());
            args.push(selected_preset);
        }
    }

    if let Some(selected_model) = model {
        if !selected_model.is_empty() {
            let model_path = resolve_selected_model_path(&engine_path, &selected_model)?;
            args.push("--model".to_string());
            args.push(path_to_string(&model_path));
        }
    }

    if let Some(mode) = video_encode {
        if !mode.is_empty() {
            args.push("--video-encode".to_string());
            args.push(mode);
        }
    }

    let mut command = Command::new(&engine_path);
    command
        .args(args)
        .current_dir(current_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut child = command.spawn().map_err(|error| {
        runtime_command_error(
            RuntimeCommandErrorKind::SpawnFailed,
            "process",
            format!("Process spawn error: {error}"),
        )
    })?;

    let stdout = child.stdout.take().ok_or_else(|| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "process",
            "Runtime process stdout was not available.",
        )
    })?;
    let stderr = child.stderr.take().ok_or_else(|| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "process",
            "Runtime process stderr was not available.",
        )
    })?;

    thread::spawn(move || {
        let stdout_app = app.clone();
        let stdout_thread = thread::spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let _ = stdout_app.emit("engine-event", line);
            }
        });

        let stderr_thread = thread::spawn(move || {
            let reader = BufReader::new(stderr);
            reader
                .lines()
                .map_while(Result::ok)
                .collect::<Vec<String>>()
        });

        let status_result = child.wait();
        let _ = stdout_thread.join();
        let stderr_lines = stderr_thread.join().unwrap_or_default();
        let stderr_text = stderr_lines.join("\n");

        match status_result {
            Ok(status) if status.success() => {}
            Ok(status) => {
                let message = if stderr_text.is_empty() {
                    format!("Runtime process exited with status {status}.")
                } else {
                    format!("Runtime process exited with status {status}. {stderr_text}")
                };
                emit_failed_process_event(&app, message);
            }
            Err(error) => {
                emit_failed_process_event(&app, format!("Runtime process wait failed: {error}"));
            }
        }
    });

    Ok(())
}

#[tauri::command]
async fn reveal_in_folder(path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    if !target.exists() {
        return Err("Output path does not exist.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        let mut command = Command::new("explorer.exe");
        if target.is_file() {
            let arg = format!("/select,{}", target.display());
            command.arg(arg);
        } else {
            command.arg(target.as_os_str());
        }
        command.creation_flags(CREATE_NO_WINDOW);
        command
            .spawn()
            .map_err(|error| format!("Failed to open Explorer: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "macos")]
    {
        let mut command = Command::new("open");
        command.arg("-R").arg(&target);
        command
            .spawn()
            .map_err(|error| format!("Failed to reveal in Finder: {error}"))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let folder = if target.is_dir() {
            target
        } else {
            target.parent().unwrap_or(&target).to_path_buf()
        };
        let mut command = Command::new("xdg-open");
        command.arg(folder);
        command
            .spawn()
            .map_err(|error| format!("Failed to open folder: {error}"))?;
        return Ok(());
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                window.show().unwrap();
                window.set_focus().unwrap();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_readiness,
            start_processing,
            reveal_in_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        candidate_runtime_roots, collect_runtime_readiness_for_path, RuntimeCommandErrorKind,
        resolve_selected_model_path, RuntimeReadinessStatus,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn candidate_runtime_roots_covers_installed_windows_resources_layout() {
        let exe_dir = PathBuf::from("CorridorKey");
        let resource_dir = exe_dir.join("resources");

        let roots = candidate_runtime_roots(&exe_dir, Some(resource_dir.as_path()));

        assert!(roots.contains(&exe_dir.join("resources").join("runtime")));
    }

    #[test]
    fn candidate_runtime_roots_deduplicates_resource_entries() {
        let exe_dir = PathBuf::from("CorridorKey");
        let resource_dir = exe_dir.join("resources");

        let roots = candidate_runtime_roots(&exe_dir, Some(resource_dir.as_path()));
        let runtime_entry = exe_dir.join("resources").join("runtime");
        let count = roots.iter().filter(|path| **path == runtime_entry).count();

        assert_eq!(count, 1);
    }

    #[test]
    fn readiness_succeeds_against_fake_runtime() {
        let runtime = fake_runtime("success");

        let readiness = collect_runtime_readiness_for_path(&runtime, vec![runtime.clone()]);

        assert_eq!(readiness.status, RuntimeReadinessStatus::Ready);
        assert!(readiness.info.ok);
        assert!(readiness.doctor.ok);
        assert!(readiness.models.ok);
        assert!(readiness.presets.ok);
    }

    #[test]
    fn readiness_reports_missing_runtime() {
        let runtime = unique_test_dir("missing").join("missing-runtime");

        let readiness = collect_runtime_readiness_for_path(&runtime, vec![runtime.clone()]);

        assert_eq!(readiness.status, RuntimeReadinessStatus::Error);
        assert_eq!(
            readiness.info.error.as_ref().map(|error| &error.kind),
            Some(&RuntimeCommandErrorKind::MissingRuntime)
        );
    }

    #[test]
    fn readiness_degrades_for_missing_model_packs() {
        let runtime = fake_runtime("missing_models");

        let readiness = collect_runtime_readiness_for_path(&runtime, vec![runtime.clone()]);

        assert_eq!(readiness.status, RuntimeReadinessStatus::Degraded);
        assert!(readiness.models.ok);
        assert!(readiness.doctor.ok);
    }

    #[test]
    fn readiness_reports_invalid_json() {
        let runtime = fake_runtime("invalid_models");

        let readiness = collect_runtime_readiness_for_path(&runtime, vec![runtime.clone()]);

        assert_eq!(readiness.status, RuntimeReadinessStatus::Error);
        assert_eq!(
            readiness.models.error.as_ref().map(|error| &error.kind),
            Some(&RuntimeCommandErrorKind::InvalidJson)
        );
    }

    #[test]
    fn readiness_reports_non_zero_doctor() {
        let runtime = fake_runtime("nonzero_doctor");

        let readiness = collect_runtime_readiness_for_path(&runtime, vec![runtime.clone()]);

        assert_eq!(readiness.status, RuntimeReadinessStatus::Error);
        assert_eq!(
            readiness.doctor.error.as_ref().map(|error| &error.kind),
            Some(&RuntimeCommandErrorKind::NonZeroExit)
        );
        assert_eq!(
            readiness
                .doctor
                .error
                .as_ref()
                .and_then(|error| error.exit_code),
            Some(7)
        );
    }

    #[test]
    fn selected_model_filename_resolves_under_runtime_models_dir() {
        let dir = unique_test_dir("model-path");
        let runtime = fake_runtime_path(&dir);

        let model_path =
            resolve_selected_model_path(&runtime, "corridorkey_fp16_1024.onnx").unwrap();

        assert_eq!(
            model_path,
            dir.join("models").join("corridorkey_fp16_1024.onnx")
        );
    }

    #[test]
    fn selected_model_absolute_path_is_preserved() {
        let dir = unique_test_dir("absolute-model-path");
        let runtime = fake_runtime_path(&dir);
        let model_path = dir.join("models").join("corridorkey_fp16_1024.onnx");

        let resolved = resolve_selected_model_path(
            &runtime,
            model_path.to_str().expect("test path is valid UTF-8"),
        )
        .unwrap();

        assert_eq!(resolved, model_path);
    }

    fn unique_test_dir(name: &str) -> PathBuf {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before UNIX_EPOCH")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("corridorkey-gui-{name}-{timestamp}"));
        fs::create_dir_all(&dir).expect("create fake runtime directory");
        dir
    }

    fn fake_runtime(mode: &str) -> PathBuf {
        let dir = unique_test_dir(mode);
        let path = fake_runtime_path(&dir);
        fs::write(&path, fake_runtime_script(mode)).expect("write fake runtime");

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&path)
                .expect("fake runtime metadata")
                .permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&path, permissions).expect("fake runtime permissions");
        }

        path
    }

    #[cfg(target_os = "windows")]
    fn fake_runtime_path(dir: &Path) -> PathBuf {
        dir.join("ck-engine.cmd")
    }

    #[cfg(not(target_os = "windows"))]
    fn fake_runtime_path(dir: &Path) -> PathBuf {
        dir.join("corridorkey")
    }

    #[cfg(target_os = "windows")]
    fn fake_runtime_script(mode: &str) -> String {
        format!(
            r#"@echo off
set mode={mode}
if "%1"=="info" (
  echo {{"version":"test-runtime","devices":[{{"name":"RTX Test","memory_mb":8192,"backend":"tensorrt"}}],"capabilities":{{"tensorrt_rtx_available":true,"multi_gpu_available":false,"cpu_fallback_available":false}},"supported_tracks":["green","blue"]}}
  exit /b 0
)
if "%1"=="doctor" if "%mode%"=="nonzero_doctor" (
  echo doctor failed 1>&2
  exit /b 7
)
if "%1"=="doctor" if "%mode%"=="missing_models" (
  echo {{"summary":{{"healthy":false,"video_healthy":false,"message":"Missing model packs"}},"models":{{"missing_models":["blue"],"missing_count":1}},"supported_tracks":["green"]}}
  exit /b 0
)
if "%1"=="doctor" (
  echo {{"summary":{{"healthy":true,"video_healthy":true,"message":"Runtime ready"}},"models":{{"missing_models":[],"missing_count":0}},"supported_tracks":["green","blue"]}}
  exit /b 0
)
if "%1"=="models" if "%mode%"=="invalid_models" (
  echo not-json
  exit /b 0
)
if "%1"=="models" if "%mode%"=="missing_models" (
  echo {{"models":[{{"id":"green","name":"Green Screen"}}],"missing_models":["blue"],"missing_count":1,"supported_tracks":["green"]}}
  exit /b 0
)
if "%1"=="models" (
  echo {{"models":[{{"id":"green","name":"Green Screen"}},{{"id":"blue","name":"Blue Screen"}}],"missing_models":[],"missing_count":0,"supported_tracks":["green","blue"]}}
  exit /b 0
)
if "%1"=="presets" (
  echo {{"presets":[{{"id":"preview","name":"Preview","description":"Fast preview"}},{{"id":"final","name":"Final","description":"Production quality"}}]}}
  exit /b 0
)
echo unknown command 1>&2
exit /b 2
"#
        )
    }

    #[cfg(not(target_os = "windows"))]
    fn fake_runtime_script(mode: &str) -> String {
        format!(
            r#"#!/bin/sh
mode="{mode}"
case "$1" in
  info)
    printf '%s\n' '{{"version":"test-runtime","devices":[{{"name":"RTX Test","memory_mb":8192,"backend":"tensorrt"}}],"capabilities":{{"tensorrt_rtx_available":true,"multi_gpu_available":false,"cpu_fallback_available":false}},"supported_tracks":["green","blue"]}}'
    ;;
  doctor)
    if [ "$mode" = "nonzero_doctor" ]; then
      echo "doctor failed" >&2
      exit 7
    fi
    if [ "$mode" = "missing_models" ]; then
      printf '%s\n' '{{"summary":{{"healthy":false,"video_healthy":false,"message":"Missing model packs"}},"models":{{"missing_models":["blue"],"missing_count":1}},"supported_tracks":["green"]}}'
      exit 0
    fi
    printf '%s\n' '{{"summary":{{"healthy":true,"video_healthy":true,"message":"Runtime ready"}},"models":{{"missing_models":[],"missing_count":0}},"supported_tracks":["green","blue"]}}'
    ;;
  models)
    if [ "$mode" = "invalid_models" ]; then
      echo "not-json"
      exit 0
    fi
    if [ "$mode" = "missing_models" ]; then
      printf '%s\n' '{{"models":[{{"id":"green","name":"Green Screen"}}],"missing_models":["blue"],"missing_count":1,"supported_tracks":["green"]}}'
      exit 0
    fi
    printf '%s\n' '{{"models":[{{"id":"green","name":"Green Screen"}},{{"id":"blue","name":"Blue Screen"}}],"missing_models":[],"missing_count":0,"supported_tracks":["green","blue"]}}'
    ;;
  presets)
    printf '%s\n' '{{"presets":[{{"id":"preview","name":"Preview","description":"Fast preview"}},{{"id":"final","name":"Final","description":"Production quality"}}]}}'
    ;;
  *)
    echo "unknown command" >&2
    exit 2
    ;;
esac
"#
        )
    }
}
