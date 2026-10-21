; CrownCRM install-time machine binding.
;
; Writes machine.lock into the install directory, bound to this computer's
; Windows MachineGuid (HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid).
; Reading the registry and writing the file are done directly in NSIS — no
; launching the exe, no PowerShell — so it is fast and reliable during an
; elevated (per-machine) install. Copying the app folder to another machine
; carries this lock with a different MachineGuid, so the app refuses to run.
;
; machine.lock content is the raw MachineGuid + newline, matching what
; src/main/licensing/install-lock.ts reads.
;
; Wired into electron-builder via `nsis.include` + `!macro customInstall`.
!macro customInstall
  ReadRegStr $0 HKLM "SOFTWARE\Microsoft\Cryptography" "MachineGuid"
  StrCmp $0 "" skip_write
  FileOpen $1 "$INSTDIR\machine.lock" w
  FileWrite $1 "$0$\r$\n"
  FileClose $1
skip_write:
!macroend