# Starts everything needed to develop FloodShield on this PC:
#   1. the API (FastAPI) on http://localhost:8000      (new window)
#   2. Metro, the React Native JS server, on :8081     (new window)
#   3. the Android emulator (unless a phone is plugged in)
#   4. builds + installs the app and connects it to the API
#
#   powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\start-dev.ps1 -NoEmulator   # use a USB phone

param([switch]$NoEmulator)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = Join-Path $root 'backend'
$mobile = Join-Path $root 'mobile'

$env:JAVA_HOME = Join-Path $env:LOCALAPPDATA 'Programs\Java\jdk-17'
$env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$env:Path = "$env:LOCALAPPDATA\Programs\nodejs;$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:ANDROID_HOME\emulator;$env:Path"
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'

# 1. API: create the Python environment on first run
$venvPython = Join-Path $api '.venv\Scripts\python.exe'
if (-not (Test-Path $venvPython)) {
  Write-Host 'Creating Python environment for the API...'
  python -m venv (Join-Path $api '.venv')
  & $venvPython -m pip install -r (Join-Path $api 'requirements-dev.txt')
}
Start-Process powershell -WorkingDirectory $api -ArgumentList '-NoExit', '-Command',
  "& '$venvPython' -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload"

# 2. Metro
if (-not (Test-Path (Join-Path $mobile 'node_modules'))) {
  Write-Host 'Installing app dependencies (npm install)...'
  Push-Location $mobile; npm install; Pop-Location
}
Start-Process powershell -WorkingDirectory $mobile -ArgumentList '-NoExit', '-Command', 'npx react-native start'

# 3. Emulator
$devices = & $adb devices | Select-String -Pattern "`tdevice$"
if (-not $devices -and -not $NoEmulator) {
  Write-Host 'Starting the Android emulator...'
  Start-Process (Join-Path $env:ANDROID_HOME 'emulator\emulator.exe') -ArgumentList '-avd', 'FloodShield_Pixel'
  & $adb wait-for-device
  while ((& $adb shell getprop sys.boot_completed 2>$null) -notmatch '1') { Start-Sleep -Seconds 3 }
}

# 4. Build, install and connect
& $adb reverse tcp:8000 tcp:8000 | Out-Null
Push-Location $mobile
npx react-native run-android
Pop-Location
& $adb reverse tcp:8000 tcp:8000 | Out-Null
Write-Host ''
Write-Host 'FloodShield is running. API docs: http://localhost:8000/docs'
