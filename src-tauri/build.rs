fn main() {
    tauri_build::build();

    // `rfd` (used by tauri-plugin-dialog) imports `TaskDialogIndirect`, which
    // only exists in common-controls v6. Tauri embeds a manifest with the v6
    // dependency into the application binary, but test binaries are separate
    // link targets and get no manifest, so they would fail to load with
    // STATUS_ENTRYPOINT_NOT_FOUND. Embed the same side-by-side dependency there.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tests.manifest");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg-tests=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg-tests=/MANIFESTINPUT:{}", manifest.display());
    }
}
