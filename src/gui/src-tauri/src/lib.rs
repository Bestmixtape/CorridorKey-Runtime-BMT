use serde::Serialize;
use serde_json::{json, Value};
use std::collections::hash_map::DefaultHasher;
use std::env;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, ExitStatus, Stdio};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::thread;
use std::time::{Duration, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};

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

#[derive(Clone, Debug, Serialize)]
struct PreviewProxy {
    source_path: String,
    path: String,
    reused: bool,
}

struct EnginePathResolution {
    path: Option<PathBuf>,
    searched_roots: Vec<PathBuf>,
    error: Option<RuntimeCommandError>,
}

#[derive(Clone)]
struct ActiveJob {
    id: u64,
    child: Arc<Mutex<Child>>,
    cancelled: Arc<AtomicBool>,
}

#[derive(Default)]
struct JobProcessState {
    inner: Mutex<JobProcessStateInner>,
}

impl Drop for JobProcessState {
    fn drop(&mut self) {
        let active = self
            .inner
            .get_mut()
            .ok()
            .and_then(|inner| inner.active.take());
        if let Some(active) = active {
            terminate_active_child(&active);
        }
    }
}

#[derive(Default)]
struct JobProcessStateInner {
    active: Option<ActiveJob>,
    next_id: u64,
}

#[cfg(target_os = "windows")]
fn engine_binary_names() -> &'static [&'static str] {
    &["ck-engine.exe", "corridorkey.exe"]
}

#[cfg(not(target_os = "windows"))]
fn engine_binary_names() -> &'static [&'static str] {
    &["corridorkey"]
}

fn primary_engine_binary_name() -> &'static str {
    engine_binary_names()[0]
}

#[cfg(target_os = "windows")]
fn preview_ffmpeg_binary_name() -> &'static str {
    "ffmpeg.exe"
}

#[cfg(not(target_os = "windows"))]
fn preview_ffmpeg_binary_name() -> &'static str {
    "ffmpeg"
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

    push_development_runtime_roots(&mut runtime_roots, exe_dir);

    runtime_roots
}

fn candidate_preview_ffmpeg_paths(exe_dir: &Path, resource_dir: Option<&Path>) -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let binary_name = preview_ffmpeg_binary_name();

    push_runtime_root(&mut candidates, exe_dir.join(binary_name));
    push_runtime_root(&mut candidates, exe_dir.join("runtime").join(binary_name));
    push_runtime_root(&mut candidates, exe_dir.join("resources").join(binary_name));
    push_runtime_root(
        &mut candidates,
        exe_dir.join("resources").join("runtime").join(binary_name),
    );

    if let Some(resource_dir) = resource_dir {
        push_runtime_root(&mut candidates, resource_dir.join(binary_name));
        push_runtime_root(&mut candidates, resource_dir.join("runtime").join(binary_name));
        push_runtime_root(&mut candidates, resource_dir.join("resources").join(binary_name));
        push_runtime_root(
            &mut candidates,
            resource_dir.join("resources").join("runtime").join(binary_name),
        );
    }

    candidates
}

fn resolve_preview_ffmpeg_path(app: Option<&AppHandle>) -> PathBuf {
    let mut exe_dir = env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    exe_dir.pop();
    let resource_dir = app.and_then(|app_handle| app_handle.path().resource_dir().ok());
    candidate_preview_ffmpeg_paths(&exe_dir, resource_dir.as_deref())
        .into_iter()
        .find(|candidate| candidate.is_file())
        .unwrap_or_else(|| PathBuf::from(preview_ffmpeg_binary_name()))
}

#[cfg(any(test, debug_assertions))]
fn push_development_runtime_roots(runtime_roots: &mut Vec<PathBuf>, exe_dir: &Path) {
    if let Some(repo_root) = find_repo_root_from_exe_dir(exe_dir) {
        push_runtime_root(
            runtime_roots,
            repo_root
                .join("build")
                .join("release")
                .join("src")
                .join("cli"),
        );
        push_runtime_root(
            runtime_roots,
            repo_root
                .join("build")
                .join("debug")
                .join("src")
                .join("cli"),
        );
    }
}

#[cfg(not(any(test, debug_assertions)))]
fn push_development_runtime_roots(_runtime_roots: &mut Vec<PathBuf>, _exe_dir: &Path) {}

#[cfg(any(test, debug_assertions))]
fn find_repo_root_from_exe_dir(exe_dir: &Path) -> Option<PathBuf> {
    exe_dir.ancestors().find_map(|ancestor| {
        let has_repo_shape = ancestor.join("CMakeLists.txt").is_file()
            && ancestor.join("src").join("gui").join("src-tauri").is_dir();
        has_repo_shape.then(|| ancestor.to_path_buf())
    })
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
        engine_binary_names()
            .iter()
            .map(|binary_name| path.join(binary_name))
            .find(|candidate| candidate.is_file())
            .or_else(|| Some(path.join(primary_engine_binary_name())))
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
        for binary_name in engine_binary_names() {
            let candidate = runtime_root.join(binary_name);
            if candidate.is_file() {
                return EnginePathResolution {
                    path: Some(candidate),
                    searched_roots: runtime_roots,
                    error: None,
                };
            }
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
                engine_binary_names().join(" or "),
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

fn runtime_binary_dir(
    engine_path: &Path,
    command_name: &str,
) -> Result<PathBuf, RuntimeCommandError> {
    engine_path
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| {
            runtime_command_error(
                RuntimeCommandErrorKind::PrerequisiteFailed,
                command_name,
                format!(
                    "Runtime binary has no parent directory: {}",
                    engine_path.display()
                ),
            )
        })
}

fn runtime_working_dir_for_engine(
    engine_path: &Path,
    command_name: &str,
) -> Result<PathBuf, RuntimeCommandError> {
    let engine_dir = runtime_binary_dir(engine_path, command_name)?;
    if engine_dir.join("models").is_dir() {
        return Ok(engine_dir);
    }

    #[cfg(any(test, debug_assertions))]
    if let Some(repo_root) = find_repo_root_from_exe_dir(&engine_dir) {
        if repo_root.join("models").is_dir() {
            return Ok(repo_root);
        }
    }

    Ok(engine_dir)
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

    let current_dir = match runtime_working_dir_for_engine(engine_path, command_name) {
        Ok(path) => path,
        Err(error) => return command_failure(command_name, error),
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

    let working_dir = runtime_working_dir_for_engine(engine_path, "process")?;

    let has_parent = model_path
        .parent()
        .is_some_and(|parent| !parent.as_os_str().is_empty());
    if has_parent {
        Ok(working_dir.join(model_path))
    } else {
        Ok(working_dir.join("models").join(model_path))
    }
}

fn failed_process_event_payload(message: impl Into<String>) -> String {
    let payload = json!({
        "type": "failed",
        "message": message.into(),
    });
    payload.to_string()
}

fn cancelled_process_event_payload() -> String {
    let payload = json!({
        "type": "cancelled",
        "message": "Processing cancelled",
    });
    payload.to_string()
}

fn runtime_exit_failure_payload(status: ExitStatus, stderr_text: &str) -> String {
    let message = if stderr_text.is_empty() {
        format!("Runtime process exited with status {status}.")
    } else {
        format!("Runtime process exited with status {status}. {stderr_text}")
    };
    failed_process_event_payload(message)
}

fn active_job_error() -> RuntimeCommandError {
    runtime_command_error(
        RuntimeCommandErrorKind::PrerequisiteFailed,
        "process",
        "A runtime job is already active. Cancel it or wait for it to finish before starting another job.",
    )
}

#[derive(Clone, Debug)]
struct ProcessCommandOptions {
    input: String,
    output: String,
    hint: Option<String>,
    preset: Option<String>,
    model: Option<String>,
    video_encode: Option<String>,
    quality_fallback: Option<String>,
    refinement_mode: Option<String>,
    precision: Option<String>,
    resolution: Option<i32>,
    batch_size: Option<i32>,
    despill: Option<f32>,
    despeckle: Option<bool>,
    tiled: Option<bool>,
}

fn push_string_arg(args: &mut Vec<String>, flag: &str, value: Option<String>) {
    if let Some(value) = value {
        if !value.is_empty() {
            args.push(flag.to_string());
            args.push(value);
        }
    }
}

fn build_process_args(
    engine_path: &Path,
    options: ProcessCommandOptions,
) -> Result<Vec<String>, RuntimeCommandError> {
    let mut args = vec![
        "process".to_string(),
        "--input".to_string(),
        options.input,
        "--output".to_string(),
        options.output,
        "--json".to_string(),
    ];

    push_string_arg(&mut args, "--alpha-hint", options.hint);
    push_string_arg(&mut args, "--preset", options.preset);

    if let Some(selected_model) = options.model {
        if !selected_model.is_empty() {
            let model_path = resolve_selected_model_path(engine_path, &selected_model)?;
            args.push("--model".to_string());
            args.push(path_to_string(&model_path));
        }
    }

    push_string_arg(&mut args, "--video-encode", options.video_encode);
    push_string_arg(&mut args, "--quality-fallback", options.quality_fallback);
    push_string_arg(&mut args, "--refinement-mode", options.refinement_mode);
    push_string_arg(&mut args, "--precision", options.precision);

    if let Some(resolution) = options.resolution {
        if resolution > 0 {
            args.push("--resolution".to_string());
            args.push(resolution.to_string());
        }
    }

    if let Some(batch_size) = options.batch_size {
        if batch_size > 0 {
            args.push("--batch-size".to_string());
            args.push(batch_size.to_string());
        }
    }

    if let Some(despill) = options.despill {
        args.push("--despill".to_string());
        args.push(despill.to_string());
    }

    if options.despeckle == Some(true) {
        args.push("--despeckle".to_string());
    }

    if options.tiled == Some(true) {
        args.push("--tiled".to_string());
    }

    Ok(args)
}

fn job_event_type_from_line(line: &str) -> Result<Option<String>, serde_json::Error> {
    let value = serde_json::from_str::<Value>(line)?;
    Ok(value
        .get("type")
        .and_then(Value::as_str)
        .map(ToString::to_string))
}

fn is_terminal_job_event_type(event_type: &str) -> bool {
    matches!(event_type, "completed" | "failed" | "cancelled")
}

fn terminal_payload_is_set(terminal_payload: &Arc<Mutex<Option<String>>>) -> bool {
    terminal_payload
        .lock()
        .expect("terminal payload mutex poisoned")
        .is_some()
}

fn set_terminal_payload(terminal_payload: &Arc<Mutex<Option<String>>>, payload: String) {
    let mut terminal_payload = terminal_payload
        .lock()
        .expect("terminal payload mutex poisoned");
    if terminal_payload.is_none() {
        *terminal_payload = Some(payload);
    }
}

fn take_terminal_payload(terminal_payload: &Arc<Mutex<Option<String>>>) -> Option<String> {
    terminal_payload
        .lock()
        .expect("terminal payload mutex poisoned")
        .take()
}

fn wait_for_child_exit(child: &Arc<Mutex<Child>>) -> std::io::Result<ExitStatus> {
    loop {
        {
            let mut child_guard = child.lock().expect("runtime child mutex poisoned");
            if let Some(status) = child_guard.try_wait()? {
                return Ok(status);
            }
        }

        thread::sleep(Duration::from_millis(50));
    }
}

fn kill_active_child(active: &ActiveJob) -> Result<bool, RuntimeCommandError> {
    let mut child = active.child.lock().expect("runtime child mutex poisoned");
    match child.try_wait() {
        Ok(Some(_status)) => Ok(false),
        Ok(None) => {
            active.cancelled.store(true, Ordering::SeqCst);
            child.kill().map_err(|error| {
                runtime_command_error(
                    RuntimeCommandErrorKind::PrerequisiteFailed,
                    "process",
                    format!("Failed to cancel runtime process: {error}"),
                )
            })?;
            Ok(true)
        }
        Err(error) => Err(runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "process",
            format!("Failed to inspect runtime process before cancellation: {error}"),
        )),
    }
}

fn kill_child_without_cancel(child: &Arc<Mutex<Child>>) {
    let mut child = child.lock().expect("runtime child mutex poisoned");
    if matches!(child.try_wait(), Ok(None)) {
        let _ = child.kill();
    }
}

fn fail_terminal_payload_and_kill_child(
    terminal_payload: &Arc<Mutex<Option<String>>>,
    child: &Arc<Mutex<Child>>,
    message: impl Into<String>,
) {
    set_terminal_payload(terminal_payload, failed_process_event_payload(message));
    kill_child_without_cancel(child);
}

fn terminate_active_child(active: &ActiveJob) {
    active.cancelled.store(true, Ordering::SeqCst);
    let mut child = active.child.lock().expect("runtime child mutex poisoned");
    if matches!(child.try_wait(), Ok(None)) {
        let _ = child.kill();
    }
    let _ = child.wait();
}

fn shutdown_active_job(state: &JobProcessState) -> bool {
    let active = {
        let mut inner = state.inner.lock().expect("job state mutex poisoned");
        inner.active.take()
    };

    if let Some(active) = active {
        terminate_active_child(&active);
        true
    } else {
        false
    }
}

fn clear_active_job(app: &AppHandle, job_id: u64) {
    let state = app.state::<JobProcessState>();
    let mut inner = state.inner.lock().expect("job state mutex poisoned");
    if inner.active.as_ref().is_some_and(|job| job.id == job_id) {
        inner.active = None;
    }
}

fn process_stdout_line(
    app: &AppHandle,
    line: String,
    terminal_payload: &Arc<Mutex<Option<String>>>,
    child: &Arc<Mutex<Child>>,
) {
    if terminal_payload_is_set(terminal_payload) {
        return;
    }

    match job_event_type_from_line(&line) {
        Ok(Some(event_type)) => {
            if is_terminal_job_event_type(&event_type) {
                set_terminal_payload(terminal_payload, line);
            } else {
                let _ = app.emit("engine-event", line);
            }
        }
        Ok(None) => {
            fail_terminal_payload_and_kill_child(
                terminal_payload,
                child,
                "Runtime emitted a JSON line without a job event type.",
            );
        }
        Err(parse_error) => {
            fail_terminal_payload_and_kill_child(
                terminal_payload,
                child,
                format!("Runtime emitted malformed JSON event output: {parse_error}"),
            );
        }
    }
}

fn supervise_runtime_process(
    app: AppHandle,
    job_id: u64,
    child: Arc<Mutex<Child>>,
    cancelled: Arc<AtomicBool>,
    terminal_payload: Arc<Mutex<Option<String>>>,
    stdout: impl std::io::Read + Send + 'static,
    stderr: impl std::io::Read + Send + 'static,
) {
    let stdout_app = app.clone();
    let stdout_terminal_payload = terminal_payload.clone();
    let stdout_child = child.clone();
    let stdout_thread = thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    process_stdout_line(&stdout_app, line, &stdout_terminal_payload, &stdout_child)
                }
                Err(error) => {
                    fail_terminal_payload_and_kill_child(
                        &stdout_terminal_payload,
                        &stdout_child,
                        format!("Runtime stdout read failed: {error}"),
                    );
                    break;
                }
            }
        }
    });

    let stderr_thread = thread::spawn(move || {
        let reader = BufReader::new(stderr);
        reader
            .lines()
            .map_while(Result::ok)
            .collect::<Vec<String>>()
    });

    let status_result = wait_for_child_exit(&child);
    let _ = stdout_thread.join();
    let stderr_lines = stderr_thread.join().unwrap_or_default();
    let stderr_text = stderr_lines.join("\n");

    match status_result {
        Ok(_status) if cancelled.load(Ordering::SeqCst) => {
            if !terminal_payload_is_set(&terminal_payload) {
                set_terminal_payload(&terminal_payload, cancelled_process_event_payload());
            }
        }
        Ok(status) if status.success() => {
            if !terminal_payload_is_set(&terminal_payload) {
                set_terminal_payload(
                    &terminal_payload,
                    failed_process_event_payload(
                        "Runtime process exited without a terminal job event.",
                    ),
                );
            }
        }
        Ok(status) => {
            if !terminal_payload_is_set(&terminal_payload) {
                set_terminal_payload(
                    &terminal_payload,
                    runtime_exit_failure_payload(status, &stderr_text),
                );
            }
        }
        Err(error) => {
            if !terminal_payload_is_set(&terminal_payload) {
                set_terminal_payload(
                    &terminal_payload,
                    failed_process_event_payload(format!("Runtime process wait failed: {error}")),
                );
            }
        }
    }

    clear_active_job(&app, job_id);
    if let Some(payload) = take_terminal_payload(&terminal_payload) {
        let _ = app.emit("engine-event", payload);
    }
}

#[tauri::command]
async fn get_runtime_readiness(app: AppHandle) -> RuntimeReadiness {
    collect_runtime_readiness(Some(&app))
}

#[tauri::command]
async fn start_processing(
    app: AppHandle,
    state: State<'_, JobProcessState>,
    input: String,
    output: String,
    hint: Option<String>,
    preset: Option<String>,
    model: Option<String>,
    video_encode: Option<String>,
    quality_fallback: Option<String>,
    refinement_mode: Option<String>,
    precision: Option<String>,
    resolution: Option<i32>,
    batch_size: Option<i32>,
    despill: Option<f32>,
    despeckle: Option<bool>,
    tiled: Option<bool>,
) -> Result<(), RuntimeCommandError> {
    let engine_path = get_engine_path(Some(&app))?;
    let current_dir = runtime_working_dir_for_engine(&engine_path, "process")?;
    let args = build_process_args(
        &engine_path,
        ProcessCommandOptions {
            input,
            output,
            hint,
            preset,
            model,
            video_encode,
            quality_fallback,
            refinement_mode,
            precision,
            resolution,
            batch_size,
            despill,
            despeckle,
            tiled,
        },
    )?;

    let mut command = Command::new(&engine_path);
    command
        .args(args)
        .current_dir(current_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    let mut inner = state.inner.lock().expect("job state mutex poisoned");
    if inner.active.is_some() {
        return Err(active_job_error());
    }

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

    let job_id = inner.next_id;
    inner.next_id = inner.next_id.saturating_add(1);
    let child = Arc::new(Mutex::new(child));
    let cancelled = Arc::new(AtomicBool::new(false));
    let terminal_payload = Arc::new(Mutex::new(None));
    inner.active = Some(ActiveJob {
        id: job_id,
        child: child.clone(),
        cancelled: cancelled.clone(),
    });
    drop(inner);

    thread::spawn(move || {
        supervise_runtime_process(
            app,
            job_id,
            child,
            cancelled,
            terminal_payload,
            stdout,
            stderr,
        );
    });

    Ok(())
}

#[tauri::command]
async fn cancel_processing(state: State<'_, JobProcessState>) -> Result<bool, RuntimeCommandError> {
    let active = {
        let inner = state.inner.lock().expect("job state mutex poisoned");
        inner.active.clone()
    };

    let Some(active) = active else {
        return Ok(false);
    };

    kill_active_child(&active)
}

#[tauri::command]
async fn create_preview_proxy(
    app: AppHandle,
    source: String,
) -> Result<PreviewProxy, RuntimeCommandError> {
    let source_path = PathBuf::from(&source);
    if !source_path.is_file() {
        return Err(runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "create_preview_proxy",
            format!("Preview source is missing: {}", source_path.display()),
        ));
    }

    let cache_root = app
        .path()
        .app_cache_dir()
        .unwrap_or_else(|_| env::temp_dir().join("CorridorKey"))
        .join("preview-proxies");
    let ffmpeg_path = resolve_preview_ffmpeg_path(Some(&app));

    let proxy = tauri::async_runtime::spawn_blocking(move || {
        create_preview_proxy_in_cache(&source_path, &cache_root, &ffmpeg_path)
    })
    .await
    .map_err(|error| {
        runtime_command_error(
            RuntimeCommandErrorKind::SpawnFailed,
            "create_preview_proxy",
            format!("Preview proxy worker failed: {error}"),
        )
    })??;
    allow_preview_asset_path(&app, Path::new(&proxy.path))?;
    Ok(proxy)
}

#[tauri::command]
fn allow_preview_asset(app: AppHandle, path: String) -> Result<(), RuntimeCommandError> {
    allow_preview_asset_path(&app, Path::new(&path))
}

fn allow_preview_asset_path(app: &AppHandle, path: &Path) -> Result<(), RuntimeCommandError> {
    if !path.is_file() {
        return Err(runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "allow_preview_asset",
            format!("Preview asset is missing: {}", path.display()),
        ));
    }

    app.asset_protocol_scope().allow_file(path).map_err(|error| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "allow_preview_asset",
            format!("Could not allow preview asset {}: {error}", path.display()),
        )
    })
}

fn create_preview_proxy_in_cache(
    source_path: &Path,
    cache_root: &Path,
    ffmpeg_path: &Path,
) -> Result<PreviewProxy, RuntimeCommandError> {
    fs::create_dir_all(cache_root).map_err(|error| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "create_preview_proxy",
            format!(
                "Could not create preview cache directory {}: {error}",
                cache_root.display()
            ),
        )
    })?;

    let proxy_path = preview_proxy_path(source_path, cache_root)?;
    if proxy_path.is_file() && proxy_path.metadata().is_ok_and(|metadata| metadata.len() > 0) {
        return Ok(PreviewProxy {
            source_path: path_to_string(source_path),
            path: path_to_string(&proxy_path),
            reused: true,
        });
    }

    let mut last_error = String::new();
    for encoder in ["libx264", "h264_mf", "h264_nvenc", "h264"] {
        let output = run_preview_ffmpeg(ffmpeg_path, source_path, &proxy_path, encoder);
        match output {
            Ok(output) if output.status.success() => {
                return Ok(PreviewProxy {
                    source_path: path_to_string(source_path),
                    path: path_to_string(&proxy_path),
                    reused: false,
                });
            }
            Ok(output) => {
                last_error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            }
            Err(error) => {
                last_error = error.to_string();
                break;
            }
        }
    }

    let mut error = runtime_command_error(
        RuntimeCommandErrorKind::PrerequisiteFailed,
        "create_preview_proxy",
        format!(
            "Could not create a browser preview proxy for {}.",
            source_path.display()
        ),
    );
    if !last_error.is_empty() {
        error.stderr = Some(last_error);
    }
    Err(error)
}

fn preview_proxy_path(
    source_path: &Path,
    cache_root: &Path,
) -> Result<PathBuf, RuntimeCommandError> {
    let metadata = source_path.metadata().map_err(|error| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "create_preview_proxy",
            format!("Could not inspect preview source {}: {error}", source_path.display()),
        )
    })?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map_or(0, |duration| duration.as_nanos());

    let mut hasher = DefaultHasher::new();
    source_path.to_string_lossy().hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    modified.hash(&mut hasher);
    hash_preview_source_content(source_path, &mut hasher)?;
    let file_stem = format!("{:016x}.mp4", hasher.finish());

    Ok(cache_root.join(file_stem))
}

fn hash_preview_source_content(
    source_path: &Path,
    hasher: &mut DefaultHasher,
) -> Result<(), RuntimeCommandError> {
    let mut file = fs::File::open(source_path).map_err(|error| {
        runtime_command_error(
            RuntimeCommandErrorKind::PrerequisiteFailed,
            "create_preview_proxy",
            format!(
                "Could not open preview source {} for hashing: {error}",
                source_path.display()
            ),
        )
    })?;
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let bytes_read = file.read(&mut buffer).map_err(|error| {
            runtime_command_error(
                RuntimeCommandErrorKind::PrerequisiteFailed,
                "create_preview_proxy",
                format!(
                    "Could not read preview source {} for hashing: {error}",
                    source_path.display()
                ),
            )
        })?;
        if bytes_read == 0 {
            break;
        }
        hasher.write(&buffer[..bytes_read]);
    }

    Ok(())
}

fn run_preview_ffmpeg(
    ffmpeg_path: &Path,
    source_path: &Path,
    proxy_path: &Path,
    encoder: &str,
) -> std::io::Result<std::process::Output> {
    let mut command = Command::new(ffmpeg_path);
    let source_arg = path_to_string(source_path);
    let proxy_arg = path_to_string(proxy_path);

    command.args([
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        source_arg.as_str(),
        "-map",
        "0:v:0",
        "-an",
        "-vf",
        "scale=-2:720",
        "-c:v",
        encoder,
        "-pix_fmt",
        "yuv420p",
    ]);

    if encoder == "libx264" {
        command.args(["-preset", "veryfast", "-crf", "23"]);
    }

    command.args([
        "-movflags",
        "+faststart",
        proxy_arg.as_str(),
    ]);

    #[cfg(target_os = "windows")]
    command.creation_flags(CREATE_NO_WINDOW);

    command.output()
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
        .manage(JobProcessState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let close_app = app.handle().clone();
                window.on_window_event(move |event| {
                    if matches!(
                        event,
                        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed
                    ) {
                        let state = close_app.state::<JobProcessState>();
                        shutdown_active_job(&state);
                    }
                });
                window.show().unwrap();
                window.set_focus().unwrap();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_runtime_readiness,
            start_processing,
            cancel_processing,
            create_preview_proxy,
            allow_preview_asset,
            reveal_in_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        build_process_args, candidate_preview_ffmpeg_paths, candidate_runtime_roots,
        collect_runtime_readiness_for_path, engine_binary_names, is_terminal_job_event_type,
        job_event_type_from_line, kill_active_child, preview_ffmpeg_binary_name,
        preview_proxy_path, resolve_selected_model_path, runtime_exit_failure_payload,
        runtime_working_dir_for_engine, shutdown_active_job, ActiveJob, JobProcessState,
        ProcessCommandOptions, RuntimeCommandErrorKind, RuntimeReadinessStatus,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::{Child, Command};
    use std::sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    };
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
    fn engine_binary_names_include_packaged_and_cmake_cli_names() {
        assert!(
            engine_binary_names().contains(&"corridorkey.exe")
                || engine_binary_names().contains(&"corridorkey")
        );

        #[cfg(target_os = "windows")]
        assert!(engine_binary_names().contains(&"ck-engine.exe"));
    }

    #[test]
    fn candidate_runtime_roots_include_cmake_cli_dir_in_development() {
        let repo = unique_test_dir("dev-runtime-root");
        let exe_dir = repo
            .join("src")
            .join("gui")
            .join("src-tauri")
            .join("target")
            .join("debug");
        fs::create_dir_all(&exe_dir).expect("create fake tauri target dir");
        fs::write(repo.join("CMakeLists.txt"), "").expect("write fake root cmake");

        let roots = candidate_runtime_roots(&exe_dir, None);

        assert!(roots.contains(&repo.join("build").join("debug").join("src").join("cli")));
        assert!(roots.contains(&repo.join("build").join("release").join("src").join("cli")));
        let release_index = roots
            .iter()
            .position(|path| *path == repo.join("build").join("release").join("src").join("cli"))
            .expect("release root");
        let debug_index = roots
            .iter()
            .position(|path| *path == repo.join("build").join("debug").join("src").join("cli"))
            .expect("debug root");

        assert!(release_index < debug_index);
    }

    #[test]
    fn preview_ffmpeg_candidates_include_packaged_runtime_resource() {
        let exe_dir = PathBuf::from("CorridorKey");
        let resource_dir = exe_dir.join("resources");
        let candidates = candidate_preview_ffmpeg_paths(&exe_dir, Some(resource_dir.as_path()));

        assert!(candidates.contains(
            &exe_dir
                .join("resources")
                .join("runtime")
                .join(preview_ffmpeg_binary_name())
        ));
    }

    #[test]
    fn runtime_working_dir_uses_repo_root_for_development_cli() {
        let repo = fake_repo_with_models("dev-runtime-cwd");
        let runtime = repo
            .join("build")
            .join("release")
            .join("src")
            .join("cli")
            .join("corridorkey.exe");
        fs::create_dir_all(runtime.parent().expect("runtime parent"))
            .expect("create fake runtime dir");
        fs::write(&runtime, "").expect("write fake runtime");

        let working_dir =
            runtime_working_dir_for_engine(&runtime, "models").expect("runtime working dir");

        assert_eq!(working_dir, repo);
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
    fn selected_model_filename_resolves_under_development_repo_models_dir() {
        let repo = fake_repo_with_models("dev-model-path");
        let runtime_dir = repo
            .join("build")
            .join("release")
            .join("src")
            .join("cli");
        fs::create_dir_all(&runtime_dir).expect("create runtime dir");
        let runtime = runtime_dir.join("corridorkey.exe");
        fs::write(&runtime, "").expect("write fake runtime");

        let model_path =
            resolve_selected_model_path(&runtime, "corridorkey_fp16_1024.onnx").unwrap();

        assert_eq!(
            model_path,
            repo.join("models").join("corridorkey_fp16_1024.onnx")
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

    #[test]
    fn process_args_include_advanced_runtime_controls() {
        let dir = unique_test_dir("advanced-process-args");
        let runtime = fake_runtime_path(&dir);
        let args = build_process_args(
            &runtime,
            ProcessCommandOptions {
                input: "input.mov".to_string(),
                output: "output.mov".to_string(),
                hint: Some("hint.mov".to_string()),
                preset: Some("preview".to_string()),
                model: None,
                video_encode: Some("balanced".to_string()),
                quality_fallback: Some("coarse_to_fine".to_string()),
                refinement_mode: Some("tiled".to_string()),
                precision: Some("fp16".to_string()),
                resolution: Some(2048),
                batch_size: Some(3),
                despill: Some(0.25),
                despeckle: Some(true),
                tiled: Some(true),
            },
        )
        .expect("build process args");

        assert_eq!(
            args,
            vec![
                "process",
                "--input",
                "input.mov",
                "--output",
                "output.mov",
                "--json",
                "--alpha-hint",
                "hint.mov",
                "--preset",
                "preview",
                "--video-encode",
                "balanced",
                "--quality-fallback",
                "coarse_to_fine",
                "--refinement-mode",
                "tiled",
                "--precision",
                "fp16",
                "--resolution",
                "2048",
                "--batch-size",
                "3",
                "--despill",
                "0.25",
                "--despeckle",
                "--tiled",
            ]
        );
    }

    #[test]
    fn preview_proxy_path_changes_when_source_changes() {
        let dir = unique_test_dir("preview-proxy-path");
        let cache = dir.join("cache");
        let source = dir.join("result.mov");
        fs::write(&source, "first").expect("write first source");

        let first = preview_proxy_path(&source, &cache).expect("first preview path");
        fs::write(&source, "second version").expect("write changed source");
        let second = preview_proxy_path(&source, &cache).expect("second preview path");

        assert_eq!(first.extension().and_then(|value| value.to_str()), Some("mp4"));
        assert_eq!(second.extension().and_then(|value| value.to_str()), Some("mp4"));
        assert_ne!(first, second);
    }

    #[test]
    fn preview_proxy_path_changes_for_same_size_fast_overwrite() {
        let dir = unique_test_dir("preview-proxy-fast-overwrite");
        let cache = dir.join("cache");
        let source = dir.join("result.mov");
        fs::write(&source, "aaaa").expect("write first source");

        let first = preview_proxy_path(&source, &cache).expect("first preview path");
        fs::write(&source, "bbbb").expect("write changed same-size source");
        let second = preview_proxy_path(&source, &cache).expect("second preview path");

        assert_ne!(first, second);
    }

    #[test]
    fn job_event_type_is_parsed_from_runtime_line() {
        let event_type = job_event_type_from_line(r#"{"type":"progress","progress":0.25}"#)
            .expect("valid job event");

        assert_eq!(event_type.as_deref(), Some("progress"));
    }

    #[test]
    fn job_event_type_rejects_malformed_runtime_line() {
        let result = job_event_type_from_line("not-json");

        assert!(result.is_err());
    }

    #[test]
    fn terminal_job_event_types_are_detected() {
        assert!(is_terminal_job_event_type("completed"));
        assert!(is_terminal_job_event_type("failed"));
        assert!(is_terminal_job_event_type("cancelled"));
        assert!(!is_terminal_job_event_type("progress"));
    }

    #[test]
    fn cancel_active_child_kills_running_process() {
        let active = ActiveJob {
            id: 1,
            child: Arc::new(Mutex::new(spawn_sleeping_child())),
            cancelled: Arc::new(AtomicBool::new(false)),
        };

        let cancelled = kill_active_child(&active).expect("cancel active child");
        let status = active
            .child
            .lock()
            .expect("runtime child mutex")
            .wait()
            .expect("wait killed child");

        assert!(cancelled);
        assert!(active.cancelled.load(Ordering::SeqCst));
        assert!(!status.success());
    }

    #[test]
    fn shutdown_active_job_clears_and_reaps_running_process() {
        let child = Arc::new(Mutex::new(spawn_sleeping_child()));
        let state = JobProcessState::default();
        {
            let mut inner = state.inner.lock().expect("job state mutex");
            inner.active = Some(ActiveJob {
                id: 2,
                child: child.clone(),
                cancelled: Arc::new(AtomicBool::new(false)),
            });
        }

        let had_active_job = shutdown_active_job(&state);
        let status = child
            .lock()
            .expect("runtime child mutex")
            .try_wait()
            .expect("inspect killed child");

        assert!(had_active_job);
        assert!(status.is_some());
        assert!(state
            .inner
            .lock()
            .expect("job state mutex")
            .active
            .is_none());
    }

    #[test]
    fn malformed_stdout_failure_kills_running_process() {
        let terminal_payload = Arc::new(Mutex::new(None));
        let child = Arc::new(Mutex::new(spawn_sleeping_child()));

        super::fail_terminal_payload_and_kill_child(
            &terminal_payload,
            &child,
            "Runtime emitted malformed JSON event output: test failure",
        );
        let status = child
            .lock()
            .expect("runtime child mutex")
            .wait()
            .expect("wait killed child");
        let payload = terminal_payload
            .lock()
            .expect("terminal payload mutex")
            .clone()
            .expect("terminal payload");

        assert!(!status.success());
        assert!(payload.contains("failed"));
        assert!(payload.contains("malformed JSON event output"));
    }

    #[test]
    fn runtime_exit_failure_payload_includes_stderr_diagnostics() {
        let output = stderr_exit_command()
            .output()
            .expect("run stderr-only failure command");

        let payload = runtime_exit_failure_payload(
            output.status,
            std::str::from_utf8(&output.stderr).expect("stderr is utf-8"),
        );
        let value = serde_json::from_str::<serde_json::Value>(&payload).expect("failed payload");
        let message = value
            .get("message")
            .and_then(serde_json::Value::as_str)
            .expect("failed payload message");

        assert_eq!(
            value.get("type").and_then(serde_json::Value::as_str),
            Some("failed")
        );
        assert!(message.contains("stderr-only failure"));
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

    fn fake_repo_with_models(name: &str) -> PathBuf {
        let repo = unique_test_dir(name);
        fs::write(repo.join("CMakeLists.txt"), "").expect("write fake root cmake");
        fs::create_dir_all(repo.join("src").join("gui").join("src-tauri"))
            .expect("create fake tauri source dir");
        fs::create_dir_all(repo.join("models")).expect("create fake models dir");
        fs::write(
            repo.join("models").join("corridorkey_fp16_1024.onnx"),
            "",
        )
        .expect("write fake model");
        repo
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
    fn spawn_sleeping_child() -> Child {
        use std::os::windows::process::CommandExt;

        let mut command = Command::new("powershell.exe");
        command.args(["-NoProfile", "-Command", "Start-Sleep -Seconds 30"]);
        command.creation_flags(super::CREATE_NO_WINDOW);
        command.spawn().expect("spawn sleeping child")
    }

    #[cfg(not(target_os = "windows"))]
    fn spawn_sleeping_child() -> Child {
        Command::new("sh")
            .args(["-c", "sleep 30"])
            .spawn()
            .expect("spawn sleeping child")
    }

    #[cfg(target_os = "windows")]
    fn stderr_exit_command() -> Command {
        let mut command = Command::new("cmd.exe");
        command.args(["/C", "echo stderr-only failure 1>&2 & exit /B 9"]);
        command
    }

    #[cfg(not(target_os = "windows"))]
    fn stderr_exit_command() -> Command {
        let mut command = Command::new("sh");
        command.args(["-c", "echo stderr-only failure >&2; exit 9"]);
        command
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
