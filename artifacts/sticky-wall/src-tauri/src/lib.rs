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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
