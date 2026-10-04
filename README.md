# CloudAttend

## Project Overview

CloudAttend is a serverless university attendance application hosted on AWS. Teachers create courses, enroll students, and open time-limited attendance sessions that display signed QR tokens. Students register with email and roll number, sign in through Amazon Cognito, and submit a QR token to record attendance. The backend verifies identity, role, enrollment, session status, token integrity and expiry, and duplicate check-ins before saving a record. The repository includes the React web app, TypeScript API, shared validation, tests, deployment scripts, and AWS CDK infrastructure.

> **Project status:** The core attendance flow is deployable, but this is not yet a production-complete release. Teacher provisioning is currently an administrative task; reporting, analytics, camera scanning, password reset UI, CI, and some operational hardening remain unfinished.

## Tech Stack

| Area | Technology | Overview |
|---|---|---|
| Frontend | React 19, Vite, React Router | Browser UI, navigation, and production bundling |
| Data fetching | TanStack Query | API requests, caching, loading, and error state |
| Authentication | AWS Amplify Auth | Cognito registration, confirmation, sign-in, and sessions |
| Backend | TypeScript, AWS Lambda, AWS SDK v3 | Serverless API and AWS data access |
| Validation | Zod, React Hook Form | Shared request schemas and browser forms |
| Database | Amazon DynamoDB | Users, courses, enrollments, sessions, and attendance |
| Infrastructure | AWS CDK v2, CloudFormation | Repeatable infrastructure definition and deployment |
| Monorepo and quality | npm workspaces, ESLint, Vitest | Dependency management, static checks, and tests |

## AWS Services Used

| Service | Use in CloudAttend | Benefit |
|---|---|---|
| Amazon Cognito | User registration, email confirmation, JWTs, and `STUDENT`/`TEACHER` groups | Managed authentication without storing passwords in the application |
| API Gateway HTTP API | Public `/health` route and JWT-protected application routes | Managed HTTPS API routing and token validation |
| AWS Lambda | Runs the API and post-confirmation user setup | Scales on demand without managing servers |
| Amazon DynamoDB | Stores application records in five on-demand tables | Fast serverless access and atomic duplicate-attendance prevention |
| AWS Secrets Manager | Generates and stores the QR HMAC signing key | Keeps signing material out of source code and the browser |
| Amazon S3 | Stores the private frontend and future report files | Durable, encrypted object storage with public access blocked |
| Amazon CloudFront | Delivers the frontend from the private S3 bucket | HTTPS delivery, caching, and React route fallback |
| IAM | Grants resource-specific permissions to application components | Limits each component to the AWS resources it needs |
| CloudFormation/CDK | Creates, updates, and removes the AWS stack | Reproducible infrastructure instead of manual console setup |

## Setup and Configuration

AWS deployment can incur charges. Use a development account and confirm the account ID before creating resources.

### 1. Prerequisites

- Node.js 24 or newer
- npm 11 or newer
- Git
- AWS CLI v2
- An AWS account whose user or role can use CloudFormation, IAM, Lambda, API Gateway, Cognito, DynamoDB, S3, CloudFront, Secrets Manager, CloudWatch, and SSM

Check the installed tools:

```bash
node --version
npm --version
aws --version
git --version
```

### 2. Install the project

Run commands from the repository root:

```bash
git clone <repository-url>
cd cloudattend
npm install
```

Use `npm ci` instead of `npm install` for a clean, lockfile-based installation.

### 3. Configure AWS credentials

Never put access keys in this repository or in browser configuration. If you use an access key and secret key, create the named profile expected by the examples:

```bash
aws configure --profile cloudattend-dev
```

Enter the access key, secret key, default region `us-east-1`, and output format `json`. Then select the profile and verify the identity:

```bash
export AWS_PROFILE=cloudattend-dev
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
aws sts get-caller-identity
```

If your organization uses IAM Identity Center instead:

```bash
aws configure sso --profile cloudattend-dev
aws sso login --profile cloudattend-dev
export AWS_PROFILE=cloudattend-dev
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
aws sts get-caller-identity
```

Confirm that the returned account is the account where CloudAttend should be deployed.

### 4. Bootstrap CDK

Bootstrap each AWS account and region once. Replace `ACCOUNT_ID` with the value returned by STS:

```bash
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1 --profile cloudattend-dev
```

An explicit deny from an AWS Organizations Service Control Policy cannot be fixed by adding an IAM policy; an organization administrator must change the SCP or provide an allowed target account.

### 5. Verify the project

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run cdk:synth
npm run check:secrets
```

`cdk:synth` only generates and validates the CloudFormation template; it does not deploy resources.

## Deployment

Keep the AWS profile and region exports from the configuration step active, then run:

```bash
npx tsx scripts/deploy.ts dev
```

This runs the checks and tests, deploys `CloudAttend-dev`, writes stack outputs to `infra/cdk-outputs.json`, generates `apps/web/public/config.json`, and builds the web app. It does not upload the final web build.

Read `FrontendBucket` and `DistributionId` from `infra/cdk-outputs.json`, then publish the frontend:

```bash
aws s3 sync apps/web/dist/ s3://FRONTEND_BUCKET --delete --profile cloudattend-dev
aws cloudfront create-invalidation \
  --distribution-id DISTRIBUTION_ID \
  --paths "/*" \
  --profile cloudattend-dev
```

Open the `CloudFrontUrl` value from `infra/cdk-outputs.json`. New CloudFront distributions can take several minutes to become available.

### Manual deployment

Use this when you want to run each deployment step yourself:

```bash
npx cdk deploy \
  --app "npx tsx infra/bin/cloudattend.ts" \
  --context environment=dev \
  --outputs-file infra/cdk-outputs.json \
  --profile cloudattend-dev

AWS_REGION=us-east-1 npx tsx scripts/generate-web-config.ts infra/cdk-outputs.json
npm --workspace @cloudattend/web run build
```

## Access and Use

1. Deploy and publish the application, then open `CloudFrontUrl`.
2. A student registers with name, email, password, and a unique university roll number.
3. The student enters the email confirmation code sent by Cognito and then signs in.
4. Teachers create courses, enroll registered students, open sessions, and display the generated QR link/token.
5. Enrolled students open the link while signed in and submit attendance before the token and session expire.

Public registration always creates a `STUDENT`. A teacher must be provisioned by an AWS administrator and must have exactly the `TEACHER` Cognito group plus a matching Users-table record whose role is `TEACHER`; the repository does not yet include the planned teacher-provisioning script. Do not give a user both application groups because backend authorization deliberately rejects ambiguous roles.

For local frontend development, first deploy a development backend and ensure `apps/web/public/config.json` was generated from that stack. Then run:

```bash
npm run dev
```

Vite normally serves the app at `http://localhost:5173`.

## Useful Commands

```bash
npm run lint          # Lint all workspaces
npm run typecheck     # Check TypeScript
npm run test          # Run tests
npm run build         # Build all workspaces
npm run cdk:synth     # Generate the CloudFormation template
npm run check:secrets # Check tracked files for common secret patterns
```

To remove the development stack, verify the account first. This deletes development tables, buckets, and their data:

```bash
aws sts get-caller-identity --profile cloudattend-dev
npx cdk destroy \
  --app "npx tsx infra/bin/cloudattend.ts" \
  --context environment=dev \
  --profile cloudattend-dev
```

## Troubleshooting

### AWS account or region is missing

```bash
aws sts get-caller-identity --profile cloudattend-dev
aws configure get region --profile cloudattend-dev
export AWS_PROFILE=cloudattend-dev
export AWS_REGION=us-east-1
export AWS_DEFAULT_REGION=us-east-1
```

### CDK reports that the environment is not bootstrapped

```bash
npx cdk bootstrap aws://ACCOUNT_ID/us-east-1 --profile cloudattend-dev
```

For `AccessDenied`, read the named action in the error. An IAM administrator must grant it; if the error says `explicit deny in a service control policy`, the AWS Organizations administrator must change that SCP.

### The frontend is blank or `/config.json` returns 404

Regenerate the runtime configuration and rebuild/upload the frontend:

```bash
AWS_REGION=us-east-1 npx tsx scripts/generate-web-config.ts infra/cdk-outputs.json
npm --workspace @cloudattend/web run build
```

Confirm that `apps/web/public/config.json` contains `region`, `apiUrl`, `userPoolId`, and `userPoolClientId` from the same deployed stack. Never add secrets to this file.

### Sign-in works but the API returns 401 or 403

Confirm the frontend uses the correct Cognito User Pool/App Client. The user must belong to exactly one of `STUDENT` or `TEACHER`; authentication alone does not grant an application role.

### `/me` has no user record

Inspect the post-confirmation Lambda logs. A unique roll number is required, and the trigger must create the Users-table profile before adding the account to `STUDENT`.

### Attendance returns `NOT_ENROLLED` or `ALREADY_EXISTS`

`NOT_ENROLLED` means the teacher has not enrolled the signed-in student in that course. `ALREADY_EXISTS` means attendance for that student and session was already recorded successfully.

### A QR token expires immediately

Synchronize the teacher and student device clocks. QR tokens intentionally expire after 45 seconds, and the attendance session must still be open.

### CDK synthesis reports an IPC permission error

Run synthesis in a normal local shell or allow the TypeScript runner to create its temporary local socket. Synthesis itself does not modify AWS resources.

## Security Notes

- Never commit `.env`, AWS credentials, passwords, tokens, private keys, `apps/web/public/config.json`, `node_modules`, `dist`, or `cdk.out`.
- The browser never receives the QR signing key and never supplies a trusted student or teacher ID.
- API Gateway validates JWTs; Lambda separately checks roles, ownership, enrollment, sessions, and signed QR data.
- Development teardown deletes data. Production deployment requires a separate profile, deliberate review, backups, monitoring, stricter CORS, and operational hardening.

More detailed implementation references remain in [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), and [docs/database.md](docs/database.md).
