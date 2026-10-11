# Waste2Value — AWS Serverless Deployment Guide

This guide details the deployment of the Waste2Value serverless architecture using AWS Serverless Application Model (AWS SAM).

---

## 1. Architecture Overview

The backend is deployed as a resilient, pay-per-use serverless application:
- **HTTP API Gateway**: Low-latency REST proxy.
- **AWS Lambda (Python 3.11)**: Runs the FastAPI backend via Mangum ASGI adapter.
- **Amazon S3**: Private evidence dossier storage with AES-256 encryption, bucket versioning, and Block Public Access.
- **Amazon DynamoDB**: Single-table persistence registry (`w2v-registry-${Stage}`) with point-in-time recovery and pay-per-request billing.
- **AWS KMS**: Asymmetric RSA-4096 key (`SIGN_VERIFY`) for RSASSA_PSS_SHA_256 digital passport signing.
- **Amazon Textract & Bedrock**: Managed document AI extraction and grounded investigative reporting.
- **AWS Step Functions**: Pipeline orchestration for asynchronous batch processing.

---

## 2. Prerequisites

1. **AWS CLI v2**: Configured with credentials possessing administrative permissions for IAM, Lambda, S3, DynamoDB, API Gateway, and KMS:
   ```bash
   aws configure
   ```
2. **AWS SAM CLI**: Installed and verified:
   ```bash
   sam --version
   ```
3. **Python 3.11**: Required runtime for building lambda dependencies.
4. **Docker**: (Optional) For local emulation via `sam local start-api`.

---

## 3. Step-by-Step Deployment Instructions

### Step 1: Validate SAM Template
Verify syntax and lint the infrastructure-as-code template:
```bash
sam validate --lint
```

### Step 2: Build the Application Artifacts
Package Python dependencies specified in `backend/requirements.txt`:
```bash
sam build
```

### Step 3: Deploy to AWS
Execute guided deployment to configure stage, region, and parameter overrides:
```bash
sam deploy --guided
```

When prompted:
- **Stack Name**: `waste2value-stack-dev`
- **AWS Region**: `eu-central-1` (or your preferred region with Bedrock support)
- **Parameter Stage**: `dev`
- **Confirm changes before deploy**: `Y`
- **Allow SAM CLI IAM role creation**: `Y`
- **Disable rollback**: `N`

SAM will output the deployed endpoints upon completion:
```text
Outputs:
ApiEndpoint: https://abc123xyz.execute-api.eu-central-1.amazonaws.com
EvidenceBucketName: w2v-evidence-dev-123456789012
DynamoDBTableName: w2v-registry-dev
KmsSigningKeyArn: arn:aws:kms:eu-central-1:123456789012:key/...
```

---

## 4. Smoke Testing Deployed Endpoints

Set your API endpoint variable:
```bash
$API_URL="https://abc123xyz.execute-api.eu-central-1.amazonaws.com"
```

1. **Health Check**:
   ```bash
   curl -s "$API_URL/health"
   ```
2. **Consignment Directory**:
   ```bash
   curl -s "$API_URL/api/batches"
   ```
3. **Public QR Verification**:
   ```bash
   curl -s "$API_URL/api/verify/W2V-CP-0001"
   ```

---

## 5. Connecting Frontend to Deployed Backend

Update `frontend/.env.local` to point to the live AWS API Gateway:
```env
NEXT_PUBLIC_API_URL=https://abc123xyz.execute-api.eu-central-1.amazonaws.com/api
```
Rebuild and launch the frontend:
```bash
cd frontend
npm run build
npm run start
```

---

## 6. Operational Monitoring & Logs

Inspect real-time Lambda execution logs using SAM CLI or AWS CloudWatch:
```bash
sam logs -n ApiFunction --stack-name waste2value-stack-dev --tail
```

---

## 7. Teardown & Resource Deletion

To safely remove all provisioned AWS cloud resources when testing is finished:
```bash
sam delete --stack-name waste2value-stack-dev
```
*Note: Empty the S3 evidence bucket prior to stack deletion if files were uploaded.*
