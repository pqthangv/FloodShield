# FloodShield - one-time developer setup for Windows (no admin rights needed).
#
# Installs into your user profile:
#   - Node.js 24 LTS            -> %LOCALAPPDATA%\Programs\nodejs
#   - JDK 17 (Eclipse Temurin)  -> %LOCALAPPDATA%\Programs\Java\jdk-17
#   - Android SDK (cmdline-tools, platform-tools, platform 36/37, build-tools, NDK, CMake,
#     emulator + an Android 16 system image) -> %LOCALAPPDATA%\Android\Sdk
# and sets JAVA_HOME / ANDROID_HOME / PATH for your Windows user.
#
# Usage (from a PowerShell window):
#   powershell -ExecutionPolicy Bypass -File scripts\setup-dev-windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\setup-dev-windows.ps1 -SkipEmulator
#
# Safe to re-run: anything already installed is skipped.

param(
  [switch]$SkipEmulator
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$NodeVersion = '24.21.0'
$JdkUrl = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk'
$CmdlineToolsUrl = 'https://dl.google.com/android/repository/commandlinetools-win-16111833_latest.zip'

$Programs = Join-Path $env:LOCALAPPDATA 'Programs'
$NodeDir = Join-Path $Programs 'nodejs'
$JdkDir = Join-Path $Programs 'Java\jdk-17'
$SdkDir = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$Downloads = Join-Path $env:TEMP 'floodshield-setup'
New-Item -ItemType Directory -Force $Programs, $Downloads | Out-Null

function Get-File($url, $dest) {
  if (-not (Test-Path $dest)) {
    Write-Host "  downloading $url"
    & curl.exe -L --fail --retry 3 -o $dest $url
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $url" }
  }
}

function Expand-Single($zip, $target) {
  # Extracts a zip whose content is a single top-level folder into $target.
  $tmp = "$target.tmp"
  if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
  Expand-Archive -Path $zip -DestinationPath $tmp
  $inner = Get-ChildItem $tmp | Select-Object -First 1
  New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
  Move-Item $inner.FullName $target
  Remove-Item -Recurse -Force $tmp
}

function Add-UserPath($dir) {
  $current = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()
  if ($current) { $parts = $current.Split(';') | Where-Object { $_ } }
  if ($parts -notcontains $dir) {
    [Environment]::SetEnvironmentVariable('Path', (($parts + $dir) -join ';'), 'User')
  }
  if (($env:Path.Split(';')) -notcontains $dir) { $env:Path = "$dir;$env:Path" }
}

# --- Node.js -------------------------------------------------------------------
Write-Host '[1/4] Node.js'
if (-not (Test-Path (Join-Path $NodeDir 'node.exe'))) {
  $zip = Join-Path $Downloads "node-v$NodeVersion-win-x64.zip"
  Get-File "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" $zip
  Expand-Single $zip $NodeDir
}
Add-UserPath $NodeDir

# --- JDK 17 --------------------------------------------------------------------
Write-Host '[2/4] JDK 17'
if (-not (Test-Path (Join-Path $JdkDir 'bin\java.exe'))) {
  $zip = Join-Path $Downloads 'jdk17.zip'
  Get-File $JdkUrl $zip
  Expand-Single $zip $JdkDir
}
[Environment]::SetEnvironmentVariable('JAVA_HOME', $JdkDir, 'User')
$env:JAVA_HOME = $JdkDir
Add-UserPath (Join-Path $JdkDir 'bin')

# --- Android SDK ---------------------------------------------------------------
Write-Host '[3/4] Android SDK'
$sdkManager = Join-Path $SdkDir 'cmdline-tools\latest\bin\sdkmanager.bat'
if (-not (Test-Path $sdkManager)) {
  $zip = Join-Path $Downloads 'cmdline-tools.zip'
  Get-File $CmdlineToolsUrl $zip
  Expand-Single $zip (Join-Path $SdkDir 'cmdline-tools\latest')
}
[Environment]::SetEnvironmentVariable('ANDROID_HOME', $SdkDir, 'User')
$env:ANDROID_HOME = $SdkDir
Add-UserPath (Join-Path $SdkDir 'platform-tools')
Add-UserPath (Join-Path $SdkDir 'emulator')
Add-UserPath (Join-Path $SdkDir 'cmdline-tools\latest\bin')

# Package paths use '/' (the 2026 Android CLI format). The old ';' form breaks when
# passed through sdkmanager.bat because cmd.exe treats ';' as an argument separator.
$packages = @(
  'platform-tools',
  'platforms/android-36',
  'platforms/android-37.0',
  'build-tools/36.0.0',
  'build-tools/37.0.0',
  'ndk/27.1.12297006',
  'cmake/3.22.1'
)
if (-not $SkipEmulator) {
  $packages += @('emulator', 'system-images/android-36/google_apis_playstore/x86_64')
}

Write-Host '  accepting SDK licenses'
$yes = (1..30 | ForEach-Object { 'y' }) -join "`n"
# The SDK tools print deprecation warnings on stderr; run them through cmd.exe so
# Windows PowerShell 5.1 does not turn those warnings into terminating errors.
$yes | cmd /c "`"$sdkManager`" --licenses >nul 2>&1"
foreach ($p in $packages) {
  Write-Host "  installing $p"
  $yes | cmd /c "`"$sdkManager`" --install `"$p`" >nul 2>&1"
  if ($LASTEXITCODE -ne 0) { throw "sdkmanager failed for $p" }
}

# --- Emulator (AVD) ------------------------------------------------------------
Write-Host '[4/4] Emulator'
if (-not $SkipEmulator) {
  $avdManager = Join-Path $SdkDir 'cmdline-tools\latest\bin\avdmanager.bat'
  $avds = cmd /c "`"$avdManager`" list avd -c 2>nul"
  if ($avds -notcontains 'FloodShield_Pixel') {
    # avdmanager still expects the ';' form; the quotes keep it as one argument for cmd.exe.
    'no' | cmd /c "`"$avdManager`" create avd -n FloodShield_Pixel -k `"system-images;android-36;google_apis_playstore;x86_64`" -d pixel_7 2>&1"
  }
} else {
  Write-Host '  skipped'
}

Write-Host ''
Write-Host 'Done. Versions:'
& (Join-Path $NodeDir 'node.exe') -v
cmd /c "`"$(Join-Path $JdkDir 'bin\java.exe')`" -version 2>&1"
& (Join-Path $SdkDir 'platform-tools\adb.exe') version | Select-Object -First 1
Write-Host ''
Write-Host 'Open a NEW terminal (or restart VS Code) so the updated PATH is picked up.'
