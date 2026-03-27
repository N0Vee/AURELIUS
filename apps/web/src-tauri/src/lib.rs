use tauri::Emitter;
use tauri::Manager;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let handle = app.handle().clone();

            let sidecar = app
                .shell()
                .sidecar("backend-server")
                .expect("failed to find backend-server sidecar");

            let (mut rx, child) = sidecar
                .spawn()
                .expect("failed to spawn backend-server sidecar");

            // Keep child alive for the entire app lifetime so the OS
            // does not kill the sidecar process when the handle is dropped.
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
                            let _ = handle.emit("backend-status", "error");
                        }
                        CommandEvent::Terminated(status) => {
                            log::warn!(
                                "[backend] process terminated, code: {:?}",
                                status.code
                            );
                            let _ = handle.emit("backend-status", "error");
                        }
                        _ => {}
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
