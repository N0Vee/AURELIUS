use tauri::Manager;
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_handle = app.handle().clone();

            // Set up the global shortcut plugin
            app.handle().plugin(
                tauri_plugin_global_shortcut::Builder::new()
                    .with_handler(move |_app, shortcut, event| {
                        // We only want to trigger on the KeyPress event, not KeyRelease
                        if event.state == ShortcutState::Pressed {
                            // Check if the pressed shortcut matches our registered one
                            if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::Space)
                            {
                                if let Some(window) = app_handle.get_webview_window("main") {
                                    // Toggle visibility
                                    if window.is_visible().unwrap_or(false) {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                        let _ = window.set_focus();
                                    }
                                }
                            }
                        }
                    })
                    .build(),
            )?;

            // Register the actual hotkey (Ctrl + Shift + Space)
            let my_shortcut =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::Space);

            let _ = app.handle().global_shortcut().register(my_shortcut);

            Ok(())
        })
        .on_window_event(|window, event| match event {
            // When the window loses focus, we can optionally hide it to mimic Spotlight
            tauri::WindowEvent::Focused(focused) => {
                if !focused {
                    // Uncomment the line below if you want it to auto-hide when you click away
                    // let _ = window.hide();
                }
            }
            _ => {}
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
