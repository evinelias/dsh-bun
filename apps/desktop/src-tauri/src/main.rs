// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{Manager, RunEvent, WindowEvent};

fn target_triple() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64", target_env = "gnu"))]
    return "x86_64-pc-windows-gnu";
    #[cfg(all(target_os = "windows", target_arch = "x86_64", not(target_env = "gnu")))]
    return "x86_64-pc-windows-msvc";
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    return "aarch64-pc-windows-msvc";
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    return "aarch64-apple-darwin";
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    return "x86_64-apple-darwin";
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    return "x86_64-unknown-linux-gnu";
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    return "aarch64-unknown-linux-gnu";
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64")
    )))]
    return "unknown";
}

fn find_sidecar_path() -> Result<PathBuf, String> {
    let triple = target_triple();
    let ext = std::env::consts::EXE_SUFFIX;

    // 1. Check relative to current executable (production bundle)
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            let candidates = [
                parent.join(format!("dsh-bun-{}{}", triple, ext)),
                parent.join(format!("dsh-bun-x86_64-pc-windows-gnu{}", ext)),
                parent.join(format!("dsh-bun-x86_64-pc-windows-msvc{}", ext)),
                parent.join(format!("dsh-bun{}", ext)),
                parent.join("binaries").join(format!("dsh-bun-{}{}", triple, ext)),
                parent.join("binaries").join(format!("dsh-bun-x86_64-pc-windows-gnu{}", ext)),
                parent.join("binaries").join(format!("dsh-bun-x86_64-pc-windows-msvc{}", ext)),
            ];
            for c in candidates {
                if c.exists() {
                    return Ok(c);
                }
            }
        }
    }

    // 2. Check CARGO_MANIFEST_DIR (development mode)
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let dev_candidates = [
        manifest_dir.join("binaries").join(format!("dsh-bun-{}{}", triple, ext)),
        manifest_dir.join("binaries").join(format!("dsh-bun-x86_64-pc-windows-gnu{}", ext)),
        manifest_dir.join("binaries").join(format!("dsh-bun-x86_64-pc-windows-msvc{}", ext)),
        manifest_dir.join("binaries").join(format!("dsh-bun{}", ext)),
        manifest_dir.join("..").join("..").join("dist").join(format!("dsh-bun{}", ext)),
    ];
    for c in dev_candidates {
        if c.exists() {
            return Ok(c);
        }
    }

    Err(format!(
        "Could not find dsh-bun sidecar binary for triple '{}'. Ensure scripts/build-sidecar.ts was run.",
        triple
    ))
}

fn main() {
    let sidecar_child: Arc<Mutex<Option<std::process::Child>>> = Arc::new(Mutex::new(None));
    let sidecar_child_exit = sidecar_child.clone();
    let sidecar_child_window = sidecar_child.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let sidecar_child_setup = sidecar_child.clone();

            // Spawn sidecar in a background thread
            thread::spawn(move || {
                let sidecar_path = match find_sidecar_path() {
                    Ok(path) => path,
                    Err(err) => {
                        eprintln!("[Tauri Desktop Error] {}", err);
                        return;
                    }
                };

                println!("[Tauri Desktop] Spawning sidecar: {:?}", sidecar_path);

                let mut cmd = std::process::Command::new(&sidecar_path);
                let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
                let repo_root = manifest_dir.join("..").join("..");
                if repo_root.exists() {
                    cmd.current_dir(&repo_root);
                } else if let Some(parent) = sidecar_path.parent() {
                    cmd.current_dir(parent);
                }
                // Start web profile in headless mode (no external browser spawn, port 0 for OS-assigned port)
                cmd.args(["web", "--no-open", "--port", "0"]);
                cmd.stdout(std::process::Stdio::piped());
                cmd.stderr(std::process::Stdio::inherit());

                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    const CREATE_NO_WINDOW: u32 = 0x08000000;
                    cmd.creation_flags(CREATE_NO_WINDOW);
                }

                match cmd.spawn() {
                    Ok(mut child) => {
                        let stdout = child.stdout.take();
                        *sidecar_child_setup.lock().unwrap() = Some(child);

                        if let Some(stdout) = stdout {
                            let reader = BufReader::new(stdout);
                            for line in reader.lines() {
                                match line {
                                    Ok(text) => {
                                        println!("[Sidecar] {}", text);
                                        // Capture startup URL: "dsh web: http://127.0.0.1:<port>/?token=<token>"
                                        if let Some(idx) = text.find("dsh web: ") {
                                            let url_str = text[idx + "dsh web: ".len()..].trim().to_string();
                                            if url_str.starts_with("http://") || url_str.starts_with("https://") {
                                                println!("[Tauri Desktop] Captured authenticated URL: {}", url_str);
                                                let target_url = url_str.clone();
                                                let handle = app_handle.clone();
                                                let handle_inner = app_handle.clone();

                                                let _ = handle.run_on_main_thread(move || {
                                                    if let Some(window) = handle_inner.get_webview_window("main") {
                                                        if let Ok(parsed_url) = target_url.parse::<tauri::Url>() {
                                                            let _ = window.navigate(parsed_url);
                                                        } else {
                                                            let eval_js = format!("window.location.replace('{}');", target_url);
                                                            let _ = window.eval(&eval_js);
                                                        }
                                                    }
                                                });
                                                break;
                                            }
                                        }
                                    }
                                    Err(_) => break,
                                }
                            }
                        }
                    }
                    Err(err) => {
                        eprintln!("[Tauri Desktop] Failed to spawn sidecar child: {}", err);
                    }
                }
            });

            Ok(())
        })
        .on_window_event(move |_window, event| {
            if let WindowEvent::Destroyed = event {
                if let Some(mut child) = sidecar_child_window.lock().unwrap().take() {
                    println!("[Tauri Desktop] Window destroyed - killing sidecar process");
                    let _ = child.kill();
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            if let RunEvent::Exit = event {
                if let Some(mut child) = sidecar_child_exit.lock().unwrap().take() {
                    println!("[Tauri Desktop] Application exit - killing sidecar process");
                    let _ = child.kill();
                }
            }
        });
}
