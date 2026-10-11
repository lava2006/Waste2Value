# Waste2Value — AWS deployment guide

Everything runs from one CloudFormation template (`template.yaml`, SAM transform) and three PowerShell scripts. No Docker and no SAM CLI are required.

## Architecture

```
Browser ──HTTPS──> CloudFront ──(default)──> S3 web bucket (private, OAC)   static Next.js export
                       │  CloudFront Function rewrites /batches/<id> etc. to the exported placeholder page
                       └──(/api/*)──> API Gateway HTTP API ──JWT (Cognito)──> Lambda (FastAPI + Mangum)
                                                                                 ├─ DynamoDB      registry (single table, PITR)
                                                                                 ├─ S3 evidence   private, presigned type/size-limited uploads
                                                                                 ├─ Rekognition   DetectText OCR for PNG/JPG: real confidence + bounding boxes
                                                                                 ├─ Bedrock       Amazon Nova (Converse): reads PDFs, AI investigator grounded on findings
                                                                                 ├─ KMS           RSA-4096 passport signing (RSASSA-PSS) + verification
                                                                                 └─ Step Functions → Workflow Lambda → Textract → rules → sign passport | SNS notify
                       CloudWatch: log groups (14 d), dashboard, alarms (API errors, failed workflows); AWS Budgets
```

Public (no sign-in): the static site, `GET /api/verify/{id}`, `POST /api/verify/{id}/tamper-demo`, `/api/health`. Everything else requires a Cognito JWT, and the backend records the **verified** e-mail from the token as the actor on decisions, corrections and revocations.

## Cost (us-east-1, design target < $15 for a month of hackathon use)

| Service | Driver | Estimate |
|---|---|---|
| CloudFront, S3, API Gateway, Lambda | well inside free tiers / cents | ~$0–1 |
| DynamoDB on-demand + PITR | a few thousand requests | < $1 |
| KMS RSA_4096 key | $1 / month + $0.15 per 10k signs | ~$1 |
| Rekognition DetectText | ~$1 per 1,000 images (5k/month free tier for 12 months) | cents |
| Bedrock Amazon Nova Lite | ~$0.06/M input tokens; a document or investigator run ≈ $0.001 | cents |
| Step Functions Standard, SNS | free tier | ~$0 |
| CloudWatch logs/dashboard/alarms | 14-day retention | ~$3 |

Not used on purpose: WAF, NAT gateways/VPC, RDS/OpenSearch, Route 53 domain. Throttling on the API (20 req/s, burst 40) bounds Lambda/Textract spend. Pass `-AlertEmail you@example.com` to the deploy script to enable the budget (50 % / 80 % actual, 100 % forecast), alarm and auditor-review e-mails.

## Prerequisites

* An AWS account and an IAM identity that can create IAM roles, Lambda, API Gateway, CloudFront, S3, DynamoDB, KMS, Cognito, Step Functions, SNS, CloudWatch and Budgets. **Do not deploy with root keys; use an IAM user or role and delete any root access keys.**
* AWS CLI (v1 or v2). On locked-down Windows machines `pip install awscli` into a venv works (the scripts take `-AwsCommand`). Configure a profile: `aws configure --profile w2v` (credentials stay in `~/.aws`, never in the repo).
* Python 3.12+ (packaging) and Node 20+.
* Amazon Nova model access (the default; works on free-plan accounts). Anthropic Claude additionally needs the Anthropic use-case form.

### Free-plan mode vs. full mode
The defaults (`ExtractionProvider=rekognition`, `BedrockModelId=us.amazon.nova-lite-v1:0`) work on AWS free-plan accounts, where **Amazon Textract** and **Anthropic Claude** are blocked (`SubscriptionRequiredException` / use-case form). Images are read by Rekognition (real OCR confidence and regions); PDFs by Nova, whose values are flagged "AI-read" in the UI because a model returns no OCR confidence or regions. After upgrading the account you can switch back without code changes:
`scripts\deploy_aws.ps1 -ExtractionProvider textract -BedrockModelId us.anthropic.claude-haiku-4-5-20251001-v1:0 -BedrockFoundationModelId anthropic.claude-haiku-4-5-20251001-v1:0`

## Deploy

```powershell
# infrastructure + API + site, with e-mail alerts
powershell -File scripts\deploy_aws.ps1 -AlertEmail you@example.com

# first sign-in user (Cognito users are admin-created; self sign-up is disabled)
powershell -File scripts\create_user.ps1 -Email auditor@your-domain.example -Password '<strong password>'
```

What the script does: packages the Lambda as Linux wheels (`scripts/package_lambda.py`) → `aws cloudformation package/deploy` → second pass that passes the CloudFront origin to Cognito callbacks and evidence-bucket CORS (avoids a circular dependency) → static export build (`npm run build:static`) → `aws s3 sync` + CloudFront invalidation. Re-run with `-SkipBackend` to redeploy only the frontend or `-SkipFrontend` for only infrastructure/API.

Smoke test:

```bash
curl https://<distribution>.cloudfront.net/api/health
curl https://<distribution>.cloudfront.net/api/verify/W2V-CP-0001      # public; shows KMS signature state
curl -i https://<distribution>.cloudfront.net/api/batches               # 401 without a token
```

The registry is seeded with the three scenario batches on first start. `Settings → What is actually connected` shows the live state of every integration as reported by `GET /api/integrations` (nothing is assumed).

## Operate

* Logs: `aws logs tail /aws/lambda/w2v-api-prod --follow --profile w2v`
* Dashboard: CloudWatch → Dashboards → `w2v-prod`
* Workflow executions: Step Functions → `w2v-verification-prod` (also startable from a batch page: **Run AWS verification workflow**)
* Cost check: `aws ce get-cost-and-usage` or Billing → Cost Explorer

## Tear down

```powershell
powershell -File scripts\teardown_aws.ps1 -Force      # empties buckets, deletes the stack (irreversible)
```

The artifact bucket `w2v-artifacts-<account>-<region>` (Lambda zips) is kept; delete it manually if desired.

## Honest limits

* Rekognition reads PNG/JPEG only and has no form understanding: "Key: Value" lines (or a "Key:" line followed by its value) are paired by rule (`app/extraction/rekognition.py`). Nova PDF reading is limited to 4.5 MB and is model output, never presented as OCR. Storage uploads are capped at 10 MB. Textract (when enabled) handles images and single-page PDFs synchronously.
* Unrecognized layouts yield fewer fields, and a typed fallback quantity can be provided at intake. Every extracted value remains correctable with an audited correction.
* The AI investigator only sees verification facts and is labelled as AI-generated; it never changes a status.
* Region is `us-east-1`; data residency requirements may call for another region (set `-Region` and update `BedrockModelId`/`BedrockFoundationModelId`).
