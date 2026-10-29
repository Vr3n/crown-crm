; Crown Books install-time machine binding.
;
; Writes `machine.lock` into the install directory, bound to this computer's
; Windows MachineGuid (HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid).
; Reading the registry and writing the file are done directly in NSIS, so it
; works during an elevated per-machine install without launching the app.
;
; Copying the install folder to another PC carries this lock with a different
; MachineGuid, so `license:status` reports LOCKED and the app refuses to run.
;
; The lock content is the raw MachineGuid plus a newline, which is what
; `src-tauri/src/license/mod.rs` reads and compares.
!macro NSIS_HOOK_POSTINSTALL
  ReadRegStr $R9 HKLM "SOFTWARE\Microsoft\Cryptography" "MachineGuid"
  StrCmp $R9 "" crown_books_lock_skip
  FileOpen $R8 "$INSTDIR\machine.lock" w
  FileWrite $R8 "$R9$\r$\n"
  FileClose $R8
crown_books_lock_skip:
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\machine.lock"
!macroend
