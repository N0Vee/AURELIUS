use std::{
    net::{TcpStream, ToSocketAddrs},
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, RunEvent, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

// ============================================================
// Backend state
// ============================================================

struct BackendState {
    child: Arc<Mutex<Option<tauri_plugin_shell::process::CommandChild>>>,
    /// Tracks whether the sidecar was spawned by us (vs. already running externally)
    owns_sidecar: Arc<Mutex<bool>>,
}

impl BackendState {
    fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            owns_sidecar: Arc::new(Mutex::new(false)),
        }
    }
}

// ============================================================
// Port / health helpers
// ============================================================

fn is_port_open(host: &str, port: u16) -> bool {
    if let Ok(addrs) = (host, port).to_socket_addrs() {
        for addr in addrs {
            if TcpStream::connect_timeout(&addr, Duration::from_millis(500)).is_ok() {
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
        thread::sleep(Duration::from_millis(300));
    }
    false
}

// ============================================================
// Sidecar lifecycle
// ============================================================

fn spawn_sidecar(app: &AppHandle) -> Result<(), String> {
    // If backend is already running (e.g. separate dev:backend), skip
    if is_port_open("127.0.0.1", 3001) || is_port_open("localhost", 3001) {
        eprintln!("[AURELIUS] Backend already running on port 3001 — skipping sidecar spawn");
        let _ = app.emit("backend-status", "ready");
        return Ok(());
    }

    let state = app.state::<BackendState>();
    let child_handle = state.child.clone();

    let mut guard = child_handle
        .lock()
        .map_err(|_| "failed to lock backend state".to_string())?;

    if guard.is_some() {
        drop(guard);
        return Ok(());
    }

    // Spawn the bundled sidecar binary
    let sidecar = app
        .shell()
        .sidecar("backend-server")
        .map_err(|e| format!("failed to create sidecar command: {e}"))?;

    let (mut rx, child) = sidecar
        .spawn()
        .map_err(|e| format!("failed to spawn backend sidecar: {e}"))?;

    eprintln!("[AURELIUS] Sidecar process spawned (pid={})", child.pid());

    *guard = Some(child);
    drop(guard);

    // Mark that we own this sidecar (so we know to kill it on exit)
    if let Ok(mut owns) = state.owns_sidecar.lock() {
        *owns = true;
    }

    // Drain sidecar stdout/stderr on a background thread so pipe buffers don't block it
    thread::spawn(move || {
        while let Some(event) = rx.blocking_recv() {
            match event {
                CommandEvent::Stdout(line) => {
                    eprintln!("[sidecar:stdout] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[sidecar:stderr] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Error(err) => {
                    eprintln!("[sidecar:error] {err}");
                }
                CommandEvent::Terminated(payload) => {
                    eprintln!(
                        "[sidecar:terminated] code={:?} signal={:?}",
                        payload.code, payload.signal
                    );
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn start_backend_async(app: AppHandle) {
    thread::spawn(move || {
        let _ = app.emit("backend-status", "starting");
        eprintln!("[AURELIUS] Starting backend sidecar...");

        match spawn_sidecar(&app) {
            Ok(()) => {
                // If port was already open, we already emitted "ready"
                if is_port_open("127.0.0.1", 3001) || is_port_open("localhost", 3001) {
                    let _ = app.emit("backend-status", "ready");
                    eprintln!("[AURELIUS] Backend is ready on port 3001");
                    return;
                }

                // Wait for the sidecar to start listening
                eprintln!("[AURELIUS] Waiting for backend to become ready on port 3001...");
                if wait_for_backend(Duration::from_secs(30)) {
                    let _ = app.emit("backend-status", "ready");
                    eprintln!("[AURELIUS] Backend is ready on port 3001");
                } else {
                    let _ = app.emit("backend-status", "error");
                    eprintln!(
                        "[AURELIUS] Backend did not become ready on port 3001 within 30 seconds"
                    );
                }
            }
            Err(err) => {
                let _ = app.emit("backend-status", "error");
                eprintln!("[AURELIUS] Backend startup failed: {err}");
            }
        }
    });
}

/// Kill the sidecar child process if we own it.
fn cleanup_backend(app: &AppHandle) {
    let state = app.state::<BackendState>();

    // Only kill if we spawned it
    let owns = state.owns_sidecar.lock().map(|g| *g).unwrap_or(false);

    if !owns {
        eprintln!("[AURELIUS] Backend was external — not killing");
        return;
    }

    let child = state.child.lock().ok().and_then(|mut g| g.take());

    if let Some(c) = child {
        eprintln!("[AURELIUS] Killing backend sidecar (pid={})", c.pid());
        let _ = c.kill();
    }
}

// ============================================================
// Window helpers
// ============================================================

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
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

/// Perform a full graceful shutdown: cleanup sidecar, unregister hotkey, exit.
fn quit_app(app: &AppHandle) {
    eprintln!("[AURELIUS] Quitting application...");
    cleanup_backend(app);
    app.exit(0);
}

// ============================================================
// Tauri commands (callable from frontend JS)
// ============================================================

#[tauri::command]
fn quit_aurelius(app: AppHandle) {
    quit_app(&app);
}

// ============================================================
// Entry point
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let backend_state = BackendState::new();
    let hotkey = Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

    tauri::Builder::default()
        .plugin(tauri_plugin_localhost::Builder::new(3000).build())
        .manage(backend_state)
        .invoke_handler(tauri::generate_handler![quit_aurelius])
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
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
            // ── System tray ────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show", "Show Aurelius").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .separator()
                .item(&quit_item)
                .build()?;

            // Embed the icon at compile time so it works in the packaged exe
            let tray_icon =
                Image::from_bytes(include_bytes!("../icons/icon.ico")).expect("bundled icon");

            let app_handle_for_tray = app.handle().clone();
            TrayIconBuilder::new()
                .icon(tray_icon)
                .tooltip("Aurelius")
                .menu(&tray_menu)
                .on_menu_event(move |_tray, event| match event.id().as_ref() {
                    "show" => show_main_window(&app_handle_for_tray),
                    "quit" => quit_app(&app_handle_for_tray),
                    _ => {}
                })
                .build(app)?;

            // ── Start backend sidecar (non-blocking) ───────────
            start_backend_async(app.handle().clone());

            // ── Register global hotkey ─────────────────────────
            if let Err(err) = app.handle().global_shortcut().register(hotkey) {
                eprintln!("[AURELIUS] Failed to register hotkey Ctrl+Shift+Space: {err}");
            }

            Ok(())
        })
        // Close button → hide (overlay-style). User quits via tray or Ctrl+Q.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app, event| {
            match event {
                // Another part of the app requested an exit (e.g. our quit_app fn)
                RunEvent::ExitRequested { .. } => {
                    cleanup_backend(app);
                }
                // Final exit — last chance to clean up
                RunEvent::Exit => {
                    cleanup_backend(app);
                }
                _ => {}
            }
        });
}
