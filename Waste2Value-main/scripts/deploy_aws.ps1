<#
.SYNOPSIS
  Deploys Waste2Value to AWS (CloudFront + S3 + API Gateway + Lambda + DynamoDB + KMS + Cognito +
  Textract + Bedrock + Step Functions + SNS + CloudWatch) using the AWS CLI and CloudFormation.

.PARAMETER Profile       AWS CLI profile (default: w2v)
.PARAMETER Region        AWS region (default: us-east-1)
.PARAMETER Stage         Environment name (default: prod)
.PARAMETER AlertEmail    Optional email for alarms, auditor notifications and budget alerts
.PARAMETER BedrockModelId / BedrockFoundationModelId  Model for the AI investigator + PDF reading (default Amazon Nova Lite: works on free-plan accounts)
.PARAMETER ExtractionProvider  rekognition (default, free-plan friendly) | textract
.PARAMETER SkipFrontend  Deploy infrastructure + API only
.PARAMETER SkipBackend   Redeploy only the frontend (static export + sync + invalidation)

Prerequisites: AWS CLI (v1 or v2) reachable via -AwsCommand, Python 3.12+ (for packaging), Node 20+.
No Docker and no SAM CLI are required; CloudFormation applies the SAM transform server-side.
#>
param(
  [string]$Profile = "w2v",
  [string]$Region = "us-east-1",
  [string]$Stage = "prod",
  [string]$AlertEmail = "",
  [string]$BedrockModelId = "us.amazon.nova-lite-v1:0",
  [string]$BedrockFoundationModelId = "amazon.nova-lite-v1:0",
  [string]$ExtractionProvider = "rekognition",
  [string]$AwsCommand = "$env:USERPROFILE\tools\awscli-venv\Scripts\python.exe -m awscli",
  [switch]$SkipFrontend,
  [switch]$SkipBackend
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$stack = "w2v-$Stage"

function Aws {
  $parts = $AwsCommand -split ' -m ', 2
  if ($parts.Count -eq 2) { & $parts[0] -m $parts[1] @args --profile $Profile --region $Region }
  else { & $AwsCommand @args --profile $Profile --region $Region }
  if ($LASTEXITCODE -ne 0) { throw "aws $($args -join ' ') failed (exit $LASTEXITCODE)" }
}

function Get-Output([string]$key) {
  (Aws cloudformation describe-stacks --stack-name $stack --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue | [0]" --output text).Trim()
}

$account = (Aws sts get-caller-identity --query Account --output text).Trim()
Write-Host "Account $account, region $Region, stack $stack"

if (-not $SkipBackend) {
  Write-Host "`n[1/5] Packaging Lambda (manylinux wheels, no Docker)"
  python scripts/package_lambda.py
  if ($LASTEXITCODE -ne 0) { throw "packaging failed" }

  $artifacts = "w2v-artifacts-$account-$Region"
  $exists = $true
  try { Aws s3api head-bucket --bucket $artifacts 2>$null | Out-Null } catch { $exists = $false }
  if (-not $exists) {
    Write-Host "Creating artifact bucket $artifacts"
    Aws s3api create-bucket --bucket $artifacts | Out-Null
    Aws s3api put-public-access-block --bucket $artifacts --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" | Out-Null
  }

  Write-Host "`n[2/5] CloudFormation package + deploy"
  Aws cloudformation package --template-file template.yaml --s3-bucket $artifacts --output-template-file build/packaged.yaml | Out-Null
  $params = @("Stage=$Stage", "AlertEmail=$AlertEmail", "BedrockModelId=$BedrockModelId", "BedrockFoundationModelId=$BedrockFoundationModelId", "ExtractionProvider=$ExtractionProvider")
  $siteOrigin = ""
  try { $siteOrigin = Get-Output "SiteUrl" } catch { $siteOrigin = "" }
  if ($siteOrigin -and $siteOrigin -ne "None") { $params += "SiteOrigin=$siteOrigin" }
  Aws cloudformation deploy --template-file build/packaged.yaml --stack-name $stack --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --parameter-overrides @params --no-fail-on-empty-changeset

  if (-not ($params -match "SiteOrigin=")) {
    # Second pass: now that the CloudFront domain exists, allow it in Cognito callbacks and evidence-bucket CORS.
    $siteOrigin = Get-Output "SiteUrl"
    Write-Host "Second pass with SiteOrigin=$siteOrigin"
    Aws cloudformation deploy --template-file build/packaged.yaml --stack-name $stack --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --parameter-overrides "Stage=$Stage" "AlertEmail=$AlertEmail" "BedrockModelId=$BedrockModelId" "BedrockFoundationModelId=$BedrockFoundationModelId" "ExtractionProvider=$ExtractionProvider" "SiteOrigin=$siteOrigin" --no-fail-on-empty-changeset
  }
}

$site = Get-Output "SiteUrl"
if (-not $SkipFrontend) {
  Write-Host "`n[3/5] Building static frontend"
  $env:NEXT_PUBLIC_API_URL = "/api"
  $env:NEXT_PUBLIC_DEPLOY_TARGET = "aws"
  $env:NEXT_PUBLIC_DEFAULT_MODE = "live"
  $env:NEXT_PUBLIC_COGNITO_DOMAIN = Get-Output "CognitoDomain"
  $env:NEXT_PUBLIC_COGNITO_CLIENT_ID = Get-Output "UserPoolClientId"
  $env:NEXT_PUBLIC_AWS_REGION = $Region
  Push-Location frontend
  npm run build:static
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "frontend build failed" }
  Pop-Location

  Write-Host "`n[4/5] Uploading site to S3 + invalidating CloudFront"
  $bucket = Get-Output "WebBucketName"
  Aws s3 sync frontend/out "s3://$bucket" --delete --cache-control "public,max-age=300" --exclude "_next/*" | Out-Null
  Aws s3 sync frontend/out/_next "s3://$bucket/_next" --delete --cache-control "public,max-age=31536000,immutable" | Out-Null
  Aws cloudfront create-invalidation --distribution-id (Get-Output "DistributionId") --paths "/*" | Out-Null
}

Write-Host "`n[5/5] Done."
Write-Host "Live URL : $site"
Write-Host "API check: $site/api/health"
Write-Host "Create a sign-in user with scripts/create_user.ps1 (Cognito users are admin-created)."
