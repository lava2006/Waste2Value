<#
.SYNOPSIS  Creates (or resets) a Cognito user with a permanent password. Password is read from -Password or prompted env; never stored in the repo.
#>
param(
  [Parameter(Mandatory = $true)][string]$Email,
  [Parameter(Mandatory = $true)][string]$Password,
  [string]$Profile = "w2v",
  [string]$Region = "us-east-1",
  [string]$Stage = "prod",
  [string]$AwsCommand = "$env:USERPROFILE\tools\awscli-venv\Scripts\python.exe -m awscli"
)
$ErrorActionPreference = "Stop"
function Aws {
  $parts = $AwsCommand -split ' -m ', 2
  if ($parts.Count -eq 2) { & $parts[0] -m $parts[1] @args --profile $Profile --region $Region }
  else { & $AwsCommand @args --profile $Profile --region $Region }
}
$pool = (Aws cloudformation describe-stacks --stack-name "w2v-$Stage" --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue | [0]" --output text).Trim()
Aws cognito-idp admin-create-user --user-pool-id $pool --username $Email --message-action SUPPRESS --user-attributes "Name=email,Value=$Email" "Name=email_verified,Value=true" 2>$null | Out-Null
Aws cognito-idp admin-set-user-password --user-pool-id $pool --username $Email --password $Password --permanent | Out-Null
Write-Host "User $Email is ready in pool $pool."
