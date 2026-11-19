# Auto-update

Crown Books checks GitHub Releases for a newer version. The check runs in the
background five seconds after launch and every six hours while the window stays
open. When a release is available the app shows a small card in the top-right
corner with the new version, an **Install update** button and **Later**. Install
downloads the signed installer, verifies the Tauri signature, installs it, and
restarts.

The check is production-only. `tauri dev` and `npm run dev:web` never replace
themselves with a released build.

## Why the manifest is on its own release

Tauri reads a static JSON manifest:

```json
{
  "version": "0.2.0",
  "pub_date": "2026-11-19T04:00:00.000Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contents of the .sig file>",
      "url": "https://github.com/Vr3n/crown-crm/releases/download/v0.2.0/Crown-Books-0.2.0-setup.exe"
    }
  }
}
```

`/releases/latest/download/latest.json` skips prereleases, and this repository
marks its versioned releases as prereleases. The updater therefore reads the
manifest from a fixed release tag, `updater`, whose `latest.json` asset is
replaced on every release. The versioned installer keeps its normal release and
URL.

Endpoint:

```text
https://github.com/Vr3n/crown-crm/releases/download/updater/latest.json
```

The `updater` release is created on the first release after this change. Do not
delete it. Its `latest.json` is overwritten by `scripts/publish-updater.mjs`.

## Signing keys

The updater cannot be disabled and will not install an unsigned artifact.

| Key | Where it lives |
|---|---|
| Public key | `plugins.updater.pubkey` in `src-tauri/tauri.conf.json` |
| Private key | GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` |

The private key for this repository was generated with:

```powershell
npx tauri signer generate -w "$env:USERPROFILE\.tauri\crown-books.key"
```

It has no password, so `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` stays unset. Back up
`%USERPROFILE%\.tauri\crown-books.key` somewhere safe. If it is lost, existing
installations can no longer receive updates and every user must install a new
build manually. If it leaks, rotate the key pair, ship one manual install, and
replace both the public key and the secret.

## Release flow

`.github/workflows/release.yml` runs semantic-release on every push to `master`.
The release step receives the signing key and does:

1. `sync-version.mjs` copies the new npm version into `Cargo.toml` and
   `tauri.conf.json`.
2. `npm run build` runs `tauri build` and produces the NSIS installer plus its
   `.sig` because `bundle.createUpdaterArtifacts` is `true`.
3. `collect-installer.mjs` copies the installer to
   `dist/Crown-Books-<version>-setup.exe`.
4. `collect-updater.mjs` writes `dist/latest.json`, pointing at that installer
   and carrying its signature.
5. `@semantic-release/github` uploads the installer and `latest.json` to the
   versioned release.
6. `publish-updater.mjs` creates the `updater` release if needed and uploads
   `latest.json` there with `--clobber`.

That means a user on any updater-capable build sees a new release after the
workflow finishes, without another manual download.

## Version behaviour

The updater installs only a version greater than the running one. A release that
ships the same version produces no prompt. Rollbacks are not supported.

The first build that contains the updater is the one released by this commit,
0.2.0. Machines on the older 0.1.0 prototype do not have the plugin and must
install 0.2.0 once by hand; from then on updates are automatic.

## Local verification

Generate the artifacts without publishing:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content "$env:USERPROFILE\.tauri\crown-books.key" -Raw).Trim()
npx tauri build
node scripts/collect-installer.mjs
node scripts/collect-updater.mjs v0.1.1
Get-Content dist/latest.json
```

The build must print `Finished 1 updater signature at ...exe.sig`, and the
manifest must contain that signature and a URL to the installer in the same
release.

## Installing an update

On Windows the installer is per-machine, so Windows asks for administrator
unless the app is already elevated. Tauri's passive mode shows the NSIS progress
window and closes the app when installation starts. The installer then relaunches
Crown Books.
