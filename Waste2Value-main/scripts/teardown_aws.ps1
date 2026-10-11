<#
.SYNOPSIS  Deletes the Waste2Value stack and its buckets. Irreversible: evidence files and the registry are destroyed.
#>
param(
  [string]$Profile = "w2v",
  [string]$Region = "us-east-1",
  [string]$Stage = "prod",
  [string]$AwsCommand = "$env:USERPROFILE\tools\awscli-venv\Scripts\python.exe -m awscli",
  [switch]$Force
)
$ErrorActionPreference = "Stop"
function Aws {
  $parts = $AwsCommand -split ' -m ', 2
  if ($parts.Count -eq 2) { & $parts[0] -m $parts[1] @args --profile $Profile --region $Region }
  else { & $AwsCommand @args --profile $Profile --region $Region }
}
if (-not $Force) { throw "Re-run with -Force to confirm deleting stack w2v-$Stage and all its data." }
$account = (Aws sts get-caller-identity --query Account --output text).Trim()
foreach ($b in @("w2v-web-$Stage-$account", "w2v-evidence-$Stage-$account")) {
  Write-Host "Emptying $b (including versions)"
  try {
    $v = Aws s3api list-object-versions --bucket $b --output json | ConvertFrom-Json
    $objs = @(); if ($v.Versions) { $objs += $v.Versions }; if ($v.DeleteMarkers) { $objs += $v.DeleteMarkers }
    foreach ($o in $objs) { Aws s3api delete-object --bucket $b --key $o.Key --version-id $o.VersionId | Out-Null }
  } catch { Write-Host "  (skipped: $($_.Exception.Message))" }
}
Aws cloudformation delete-stack --stack-name "w2v-$Stage"
Aws cloudformation wait stack-delete-complete --stack-name "w2v-$Stage"
Write-Host "Stack deleted. The artifact bucket w2v-artifacts-$account-$Region (Lambda zips) is kept; delete it manually if desired."
