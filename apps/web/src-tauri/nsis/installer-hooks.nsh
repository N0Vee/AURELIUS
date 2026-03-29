; ============================================================
; Aurelius NSIS Installer Hooks
; ============================================================
; These macros are called by Tauri's generated NSIS installer
; at key points during install and uninstall.
;
; NSIS_HOOK_POSTINSTALL  → runs after all files are copied and
;                          shortcuts are created.
; NSIS_HOOK_POSTUNINSTALL → runs after all files and shortcuts
;                           are removed.
;
; We use these hooks to register / deregister the Windows
; startup entry so Aurelius appears in Task Manager →
; Startup Apps immediately after installation — before the
; user even launches the app once (same as Discord / Slack).
; ============================================================

!macro NSIS_HOOK_POSTINSTALL
  ; Write the Run registry key so Windows launches Aurelius at login.
  ; HKCU requires no Administrator rights and matches installMode "currentUser".
  ; The path is quoted to handle spaces in $INSTDIR (e.g. C:\Users\...\Programs\Aurelius).
  WriteRegStr HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "Aurelius" \
    '"$INSTDIR\Aurelius.exe"'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Remove the startup entry when the user uninstalls Aurelius.
  DeleteRegValue HKCU \
    "Software\Microsoft\Windows\CurrentVersion\Run" \
    "Aurelius"
!macroend
