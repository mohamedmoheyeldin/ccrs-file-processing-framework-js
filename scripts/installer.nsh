!macro customPageAfterChangeDir
  Page custom CCRSInstallSummary
  Function CCRSInstallSummary
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
      !insertmacro MUI_HEADER_TEXT "Upgrade CCRS" "An existing installation was found in the selected folder."
      ${NSD_CreateLabel} 0 10u 100% 60u "Upgrade CCRS File Processing Framework to ${VERSION}. Your saved application settings will be retained."
      Pop $0
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:Upgrade"
    ${Else}
      !insertmacro MUI_HEADER_TEXT "Install CCRS" "Set up CCRS File Processing Framework on this computer."
      ${NSD_CreateLabel} 0 10u 100% 60u "Install CCRS File Processing Framework ${VERSION} in the selected folder."
      Pop $0
      GetDlgItem $0 $HWNDPARENT 1
      SendMessage $0 ${WM_SETTEXT} 0 "STR:Install"
    ${EndIf}
    nsDialogs::Show
  FunctionEnd
!macroend
