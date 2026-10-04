# Creates the upload key used to sign FloodShield for Google Play (run ONCE).
#
#   powershell -ExecutionPolicy Bypass -File scripts\create-upload-key.ps1
#
# It writes:
#   mobile\android\app\floodshield-upload.keystore
#   mobile\android\keystore.properties
# Both are git-ignored. BACK THEM UP (e.g. a password manager + a USB drive):
# if you lose the upload key you must ask Google Play support to reset it.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root 'mobile\android'
$keystore = Join-Path $androidDir 'app\floodshield-upload.keystore'
$props = Join-Path $androidDir 'keystore.properties'

if (Test-Path $keystore) {
  Write-Host "Keystore already exists: $keystore"
  Write-Host 'Delete it first only if you are sure it was never used for an upload.'
  exit 1
}

$keytool = Join-Path $env:LOCALAPPDATA 'Programs\Java\jdk-17\bin\keytool.exe'
if (-not (Test-Path $keytool)) { $keytool = 'keytool' }

$secure = Read-Host 'Choose a keystore password (min 6 characters)' -AsSecureString
$password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($password.Length -lt 6) { throw 'Password must be at least 6 characters.' }
$name = Read-Host 'Your name or organisation (shown in the certificate)'

& $keytool -genkeypair -v -storetype PKCS12 `
  -keystore $keystore -alias floodshield `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -storepass $password -keypass $password `
  -dname "CN=$name, OU=FloodShield, O=$name, C=VN"
if ($LASTEXITCODE -ne 0) { throw 'keytool failed' }

@"
storeFile=floodshield-upload.keystore
storePassword=$password
keyAlias=floodshield
keyPassword=$password
"@ | Set-Content -Path $props -Encoding ascii

Write-Host ''
Write-Host "Created $keystore"
Write-Host "Created $props"
Write-Host 'Release builds (npm run build:aab) are now signed with this key. Back both files up!'
