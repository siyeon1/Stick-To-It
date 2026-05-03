// Stage A entrypoint. Deliberately minimal:
//
//   * No `WindowEvent::CloseRequested` handler — task spec says the
//     X button must close the app on Windows. Default behavior
//     already does that, so any handler here would be a regression.
//   * No `RunEvent::Reopen` handler — that's a macOS-only event.
//   * No `ActivationPolicy::Accessory/Regular` — also macOS-only.
//   * No native menu — WebView2 handles Ctrl+C/V/X/Z/Y/A inside
//     text inputs natively, and an empty edit menu adds nothing.
//
// Storage and updater plugins arrive in Stages B and C respectively.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Persist window position + size across launches at
        // `%APPDATA%\com.siyeonkang.sticktoit\.window-state.json`.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Stage B: notes are persisted to a real file in the
        // app-data dir via @tauri-apps/plugin-fs from the renderer.
        .plugin(tauri_plugin_fs::init())
        // Ensure the app-data dir (`%APPDATA%\com.siyeonkang.sticktoit\`
        // on Windows) exists before the renderer loads. The renderer's
        // capability set is intentionally locked down to scoped
        // read/write/rename of `notes.json` / `notes.json.tmp` only —
        // it has no `fs:allow-mkdir` — so we create the directory once
        // here in Rust where the manager has full filesystem access.
        // On a fresh install this prevents the first save from racing
        // window-state's own dir-creation-on-close.
        .setup(|app| {
            use tauri::Manager;
            if let Ok(dir) = app.path().app_data_dir() {
                let _ = std::fs::create_dir_all(&dir);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
