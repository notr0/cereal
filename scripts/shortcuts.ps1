# Adds Cereal to the Start menu and the desktop, pointing at the app built by `npm run dist`.
# Re-running is safe: existing shortcuts are overwritten. Rebuilding updates the app in place.
$ErrorActionPreference = 'Stop'
$exe = Join-Path $PSScriptRoot '..\dist\win-unpacked\Cereal.exe'
if (-not (Test-Path $exe)) { throw 'Build the app first with: npm run dist' }
$exe = (Resolve-Path $exe).Path
$shell = New-Object -ComObject WScript.Shell
foreach ($dir in [Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop')) {
  $path = Join-Path $dir 'Cereal.lnk'
  $lnk = $shell.CreateShortcut($path)
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = Split-Path $exe
  $lnk.IconLocation = "$exe,0"
  $lnk.Description = 'Cereal meeting notes'
  $lnk.Save()
  Write-Output "Created $path"
}
