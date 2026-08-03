param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath
)

$thumbprint = $env:RENITIZER_WINDOWS_CERTIFICATE_THUMBPRINT
$timestampUrl = $env:RENITIZER_WINDOWS_TIMESTAMP_URL

if ([string]::IsNullOrWhiteSpace($thumbprint) -or [string]::IsNullOrWhiteSpace($timestampUrl)) {
  throw 'Windows signing requires RENITIZER_WINDOWS_CERTIFICATE_THUMBPRINT and RENITIZER_WINDOWS_TIMESTAMP_URL.'
}

$toolCandidates = Get-ChildItem -Path "$env:ProgramFiles(x86)\Windows Kits\10\bin" -Filter signtool.exe -Recurse -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
  Sort-Object FullName -Descending

if (-not $toolCandidates) {
  throw 'signtool.exe was not found in the Windows SDK.'
}

& $toolCandidates[0].FullName sign /fd sha256 /sha $thumbprint /tr $timestampUrl /td sha256 $TargetPath
if ($LASTEXITCODE -ne 0) {
  throw "signtool failed for $TargetPath with exit code $LASTEXITCODE."
}
