use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        // Intercept the close button (and Alt+F4) → hide to tray instead of quitting
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // ── Spawn backend sidecar ────────────────────────────────────
            let handle = app.handle().clone();

            let sidecar = app
                .shell()
                .sidecar("backend-server")
                .expect("failed to find backend-server sidecar");

            let (mut rx, child) = sidecar
                .spawn()
                .expect("failed to spawn backend-server sidecar");

            // Keep child alive for the entire app lifetime
            app.manage(child);

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
