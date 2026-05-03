// Hide the console window in release builds on Windows. Without this,
// double-clicking the installed `.exe` would also pop up a Win32
// console behind the WebView. Debug builds keep the console so
// `eprintln!` output is visible during `tauri dev`.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sticky_wall_lib::run();
}
