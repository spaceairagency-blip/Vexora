#ifndef AppVersion
  #define AppVersion "2.0.0"
#endif

[Setup]
AppId={{2AD5B28A-2EAA-4E02-97ED-813A03A93CE0}
AppName=Vexora
AppVersion={#AppVersion}
AppPublisher=CodelyTeam
DefaultDirName={autopf}\Vexora
DefaultGroupName=Vexora
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist-installer
OutputBaseFilename=Vexora-Setup
SetupIconFile=assets\icon.ico
UninstallDisplayIcon={app}\Vexora.exe
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"; Flags: unchecked

[Files]
Source: "dist\Vexora\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Vexora"; Filename: "{app}\Vexora.exe"
Name: "{autodesktop}\Vexora"; Filename: "{app}\Vexora.exe"; Tasks: desktopicon

[Run]
; normal install: offer to launch
Filename: "{app}\Vexora.exe"; Description: "Launch Vexora"; Flags: nowait postinstall skipifsilent
; silent update: reopen automatically
Filename: "{app}\Vexora.exe"; Flags: nowait; Check: WizardSilent
