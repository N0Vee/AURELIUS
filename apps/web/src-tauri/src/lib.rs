use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Preferred port for the localhost plugin to serve the frontend assets.
/// Falls back to a random free port if this one is taken.
#[cfg(not(dev))]
const FRONTEND_PORT: u16 = 3000;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Port is only needed in production where the localhost plugin serves
    // the embedded frontend. In dev mode, Next.js dev server handles it.
    #[cfg(not(dev))]
    let port = if portpicker::is_free_tcp(FRONTEND_PORT) {
        FRONTEND_PORT
    } else {
        portpicker::pick_unused_port().expect("failed to find an unused port")
    };

    let mut builder = tauri::Builder::default();

    // ── Localhost plugin (PRODUCTION ONLY) ────────────────────────────────
    // Serves the embedded frontend (`frontendDist`) on a real HTTP server
    // at http://localhost:{port} instead of Tauri's custom protocol.
    // This fixes cross-origin, SSE streaming, and fetch() quirks in
    // production builds.
    //
    // In dev mode, the Next.js dev server already occupies port 3000 and
    // Tauri uses `devUrl` to point the webview at it, so the localhost
    // plugin must NOT be loaded — otherwise it steals port 3000 and causes
    // HTTP 500 errors.
    #[cfg(not(dev))]
    {
        builder = builder.plugin(tauri_plugin_localhost::Builder::new(port).build());
    }

    builder
        .plugin(tauri_plugin_shell::init())
        // Intercept the close button (and Alt+F4) → hide to tray instead of quitting
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(move |app| {
            // ── Logging (debug only) ─────────────────────────────────────
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ── Build the window URL ─────────────────────────────────────
            // In `tauri dev` the Next.js dev server is used via devUrl,
            // so we point at the default app path.
            // In production we point at the localhost plugin's HTTP server
            // and grant its origin access to Tauri IPC via CapabilityBuilder.
            #[cfg(dev)]
            let url = tauri::WebviewUrl::App(std::path::PathBuf::from("/"));

            #[cfg(not(dev))]
            let url = {
                let localhost_url: tauri::Url =
                    format!("http://localhost:{}", port).parse().unwrap();

                // Grant the http://localhost:{port} origin access to all
                // default capabilities so Tauri IPC (startDragging, hide,
                // global shortcuts, shell, etc.) works from the remote origin.
                app.add_capability(
                    tauri::ipc::CapabilityBuilder::new("localhost-ipc")
                        .permission("core:default")
                        .permission("core:window:allow-hide")
                        .permission("core:window:allow-show")
                        .permission("core:window:allow-start-dragging")
                        .permission("core:window:allow-set-focus")
                        .permission("core:window:allow-unminimize")
                        .permission("core:window:allow-is-visible")
                        .permission("core:window:allow-toggle-maximize")
                        .permission("core:webview:allow-set-webview-background-color")
                        .permission("global-shortcut:allow-register")
                        .permission("shell:allow-execute")
                        .remote(localhost_url.to_string())
                        .window("main"),
                )?;

                tauri::WebviewUrl::External(localhost_url)
            };

            // ── Create main window ───────────────────────────────────────
            // The window is created in code (not tauri.conf.json) so we can
            // pass the correct URL depending on dev vs production.
            let _main_window = tauri::WebviewWindowBuilder::new(app, "main".to_string(), url)
                .title("Aurelius")
                .inner_size(400.0, 600.0)
                .resizable(false)
                .fullscreen(false)
                .center()
                .decorations(false)
                .transparent(false)
                .always_on_top(true)
                .skip_taskbar(false)
                .visible(true)
                .shadow(true)
                .build()?;

            // ── Spawn backend sidecar ────────────────────────────────────
            let handle = app.handle().clone();

            let sidecar = app
                .shell()
                .sidecar("backend-server")
                .expect("failed to find backend-server sidecar");

            let (mut rx, child) = sidecar
                .spawn()
                .expect("failed to spawn backend-server sidecar");

            // Keep child alive and accessible for cleanup on exit
            app.manage(std::sync::Mutex::new(Some(child)));

            tauri::async_runtime::spawn(async move {
                while let Some(event) = rx.recv().await {
                    match event {
                        CommandEvent::Stdout(bytes) => {
                            let line = String::from_utf8_lossy(&bytes);
                            log::info!("[backend] {}", line.trim());
                        }
                        CommandEvent::Stderr(bytes) => {
                            let line = String::from_utf8_lossy(&bytes);
                            log::warn!("[backend:err] {}", line.trim());
                        }
                        CommandEvent::Error(e) => {
                            log::error!("[backend] process error: {}", e);
                        }
                        CommandEvent::Terminated(status) => {
                            log::warn!("[backend] process terminated, code: {:?}", status.code);
                        }
                        _ => {}
                    }
                }
            });

            // ── System tray ──────────────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show", "Open Aurelius").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &quit_item])
                .build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Aurelius — Alt+Space to toggle")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            // ── Global shortcut: Alt+Space → toggle overlay ──────────────
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{
                    Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState,
                };

                let toggle_shortcut = Shortcut::new(Some(Modifiers::ALT), Code::Space);
                let toggle_shortcut_for_handler = toggle_shortcut.clone();
                let handle_for_shortcut = handle.clone();

                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |_app, shortcut, event| {
                            if shortcut == &toggle_shortcut_for_handler
                                && event.state() == ShortcutState::Pressed
                            {
                                if let Some(window) = handle_for_shortcut.get_webview_window("main")
                                {
                                    if window.is_visible().unwrap_or(false) {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        })
                        .build(),
                )?;

                app.global_shortcut().register(toggle_shortcut)?;
            }

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                // Explicitly kill the backend sidecar so port 3001 is released.
                // On Windows, child processes are NOT killed automatically when
                // the parent exits — they become orphans holding the port open,
                // which prevents the next app launch from connecting.
                if let Some(state) =
                    app_handle.try_state::<std::sync::Mutex<Option<CommandChild>>>()
                {
                    if let Ok(mut guard) = state.lock() {
                        if let Some(child) = guard.take() {
                            let _ = child.kill();
                            log::info!("[backend] sidecar killed on exit");
                        }
                    }
                }
            }
        });
}
