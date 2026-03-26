use std::{
    net::{TcpStream, ToSocketAddrs},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct BackendState {
    child: Arc<Mutex<Option<Child>>>,
}

impl BackendState {
    fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
        }
    }
}

fn is_port_open(host: &str, port: u16) -> bool {
    if let Ok(addrs) = (host, port).to_socket_addrs() {
        for addr in addrs {
            if TcpStream::connect(addr).is_ok() {
                return true;
            }
        }
    }

    false
}

fn wait_for_backend(timeout: Duration) -> bool {
    let start = Instant::now();

    while start.elapsed() < timeout {
        if is_port_open("127.0.0.1", 3001) || is_port_open("localhost", 3001) {
            return true;
        }
        thread::sleep(Duration::from_millis(250));
    }

    false
}

fn spawn_backend() -> Result<Child, String> {
    let mut command = Command::new("bun");

    command
        .args(["run", "start"])
        .current_dir("../../backend")
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());

    command
        .spawn()
        .map_err(|e| format!("failed to spawn backend: {e}"))
}

fn ensure_backend_running(app: &AppHandle) -> Result<(), String> {
    if is_port_open("127.0.0.1", 3001) || is_port_open("localhost", 3001) {
        let _ = app.emit("backend-status", "ready");
        return Ok(());
    }

    let child_handle = {
        let state = app.state::<BackendState>();
        state.child.clone()
    };

    let mut guard = child_handle
        .lock()
        .map_err(|_| "failed to lock backend state".to_string())?;

    if guard.is_none() {
        let child = spawn_backend()?;
        *guard = Some(child);
    }

    drop(guard);

    if wait_for_backend(Duration::from_secs(20)) {
        let _ = app.emit("backend-status", "ready");
        Ok(())
    } else {
        let _ = app.emit("backend-status", "error");
        Err("backend did not become ready on port 3001 within timeout".to_string())
    }
}

fn cleanup_backend(app: &AppHandle) {
    let child_handle = app.state::<BackendState>().child.clone();

    let mut child_to_kill = None;

    if let Ok(mut guard) = child_handle.lock() {
        child_to_kill = guard.take();
    }

    if let Some(mut child) = child_to_kill {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let is_visible = window.is_visible().unwrap_or(false);

        if is_visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_state = BackendState::new();
    let hotkey = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .manage(backend_state)
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == ShortcutState::Pressed
                        && shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::Space)
                    {
                        toggle_main_window(app);
                    }
                })
                .build(),
        )
        .setup(move |app| {
            let _ = app.emit("backend-status", "starting");

            if let Err(err) = ensure_backend_running(app.handle()) {
                eprintln!("[AURELIUS] Backend startup warning: {err}");
            }

            if let Err(err) = app.handle().global_shortcut().register(hotkey) {
                eprintln!("[AURELIUS] Failed to register hotkey Ctrl+Shift+Space: {err}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app, event| {
            if matches!(event, RunEvent::ExitRequested { .. } | RunEvent::Exit) {
                cleanup_backend(app);
            }
        });
}
