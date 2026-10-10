# CloudAttend

## Project Overview

CloudAttend is a serverless university attendance application on AWS. Teachers create courses, enroll students by email or roll number, and open time-limited attendance sessions. Each session shows a rotating, HMAC-signed QR code that expires after 45 seconds. Students register with their email and roll number, verify the email, and record attendance. They can scan with the in-app camera scanner, open the QR link with their phone camera, or paste the code.

The backend checks all of the following before saving a check-in:

- identity and role
- course ownership and enrollment
- session state
- token signature and expiry
- duplicate check-ins

Teachers get live check-in lists, session history, and per-student reports against an attendance threshold, with CSV export. Administrators promote registered users to teachers.

The repository contains:

- the React web app (shadcn/ui)
- the TypeScript Lambda API
- the Cognito triggers
- shared validation
- AWS CDK infrastructure
- unit, component, infrastructure and end-to-end tests
- deployment scripts
- a local development server that runs the whole app without AWS

> **Status:** All features are implemented and tested locally (see [docs/test-report.md](docs/test-report.md) and [docs/bug-report.md](docs/bug-report.md)). Before relying on it in production, deploy to an AWS account, configure Amazon SES for Cognito email, and run the smoke test in [Deployment](#deployment).

## Features

| Role | What they can do |
|---|---|
| Everyone | Sign up with email verification (6-digit code, resend), sign in, forgot/reset password, change password, light/dark theme |
| Student | Dashboard with attendance rate per course, camera QR scanner with manual fallback, one-tap check-in from a phone-camera link, attendance history |
| Teacher | Create, edit and delete courses; add or remove students by email or roll number; start a session with a full-screen auto-rotating QR code and live check-in list; session history; report with threshold flags and CSV download |
| Administrator | List users, promote students to teachers or demote them (the user is signed out everywhere so the new role applies) |

## Tech Stack

| Area | Technology | Overview |
|---|---|---|
| Frontend | React 19, Vite, React Router | Browser UI, routing with lazy-loaded pages, production bundling |
| UI components | shadcn/ui (Radix), Tailwind CSS v4, lucide icons, sonner | Ready-made accessible components and blocks (login, sign-up, sidebar) |
| Forms | React Hook Form, Zod | Client validation that shares schemas with the API |
| Data fetching | TanStack Query | Caching, polling for live sessions, loading and error state |
| Authentication | AWS Amplify Auth with Amazon Cognito | SRP sign-in, sign-up, email codes, password reset, new-password challenge |
| QR | qrcode.react, @yudiel/react-qr-scanner | QR rendering and camera scanning (decoder self-hosted) |
| Backend | TypeScript, AWS Lambda, AWS SDK v3 | Serverless API and Cognito triggers |
| Database | Amazon DynamoDB | Users, courses, enrollments, sessions, attendance |
| Infrastructure | AWS CDK v2, CloudFormation | Repeatable infrastructure definition and deployment |
| Quality | npm workspaces, ESLint, Vitest, Testing Library, MSW, Playwright, axe-core, GitHub Actions | Linting, unit/component/e2e/accessibility tests, CI |

## AWS Services Used

| Service | Use in CloudAttend | Benefit |
|---|---|---|
| Amazon Cognito | Registration, email verification, password reset, JWTs, and `STUDENT`/`TEACHER`/`ADMIN` groups. PreSignUp and PostConfirmation triggers | Managed authentication; passwords never touch the application |
| API Gateway HTTP API | JWT-protected routes, throttling, access logs | Managed HTTPS API with token validation |
| AWS Lambda | API router and the two Cognito triggers | Scales on demand without servers |
| Amazon DynamoDB | Five on-demand tables with GSIs | Serverless storage; conditional writes prevent duplicates |
| AWS Secrets Manager | Generated QR HMAC signing key | Keeps signing material out of code and the browser |
| Amazon S3 + CloudFront | Private frontend bucket behind CloudFront with OAC, CSP and security headers | HTTPS delivery, caching, SPA routing |
| CloudWatch | Log groups (30 days), Lambda error and API 5xx alarms | Operations visibility |
| IAM | Per-function roles scoped to specific tables and the user pool | Least privilege |

## Run It Locally (No AWS Needed)

```bash
npm install
npm run dev:local
```

This starts two things:

- The **local API** on `http://127.0.0.1:8787`. It runs the real API router against in-memory data and emulates the Cognito flows.
- The **web app** on `http://127.0.0.1:5173`.

Data resets whenever the API restarts. Every demo account uses the password `CloudAttend#2026`:

| Account | Role |
|---|---|
| `admin@cloudattend.local` | Teacher + administrator |
| `teacher@cloudattend.local` | Teacher (owns course CS101) |
| `student@cloudattend.local` | Student enrolled in CS101 |
| `riley@cloudattend.local` | Student, not enrolled |

Verification and reset codes are always `123456`; the local API also prints them in the terminal. Local mode exists only in `vite --mode demo|e2e`; the production build does not contain it.

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
npm run test:e2e        # Playwright: starts the local API and web app itself
```

`cdk:synth` only generates and validates the CloudFormation template; it does not deploy resources.

## Deployment

Keep the AWS profile and region exports from the configuration step active, then run:

```bash
npx tsx scripts/deploy.ts dev
```

The script does the following, in order:

1. Runs lint, typecheck, tests and `cdk synth`.
2. Deploys `CloudAttend-dev`.
3. Writes the stack outputs to `infra/cdk-outputs.json`.
4. Generates `apps/web/public/config.json` and builds the web app.
5. Uploads the build: hashed assets are cached as immutable; `index.html` and `config.json` are `no-cache`.
6. Invalidates CloudFront.

Open the printed `CloudFrontUrl`. A new CloudFront distribution can take several minutes to become available. For production, use `prod`; IAM-broadening changes then require approval.

### Create the first administrator

Register through the web app as normal, then grant the `ADMIN` group:

```bash
npx tsx scripts/bootstrap-admin.ts you@university.edu
```

Sign out and back in. **Users & roles** now appears in the sidebar, and you can promote other registered users to teachers there. Promoting yourself to teacher needs a second administrator; alternatively, run the same `AdminAddUserToGroup`/`AdminRemoveUserFromGroup` calls with the AWS CLI.

### Post-deployment smoke test

1. Sign up as a student and confirm the code email arrives.
2. Sign in as the administrator, then promote a second account to teacher.
3. As the teacher: create a course, add the student by email, and start attendance.
4. As the student: scan the QR code with a phone and confirm "Attendance recorded".
5. As the teacher: confirm the live list updates, close the session, and download the CSV report.
6. Test "Forgot password" on the teacher account; the teacher must keep the teacher role.

### Production checklist

- Configure Cognito to send email through Amazon SES. The default sender allows only about 50 emails a day.
- Subscribe an SNS topic or email address to the two CloudWatch alarms.
- Optionally add a custom domain and certificate for CloudFront. Then update the CORS origin and the `connect-src` CSP if your API is on a custom domain.

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

# Upload: hashed assets are immutable; index.html and config.json must revalidate.
BUCKET=s3://$(jq -r '.["CloudAttend-dev"].FrontendBucket' infra/cdk-outputs.json)
aws s3 sync apps/web/dist/ "$BUCKET" --delete --exclude index.html --exclude config.json \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 cp apps/web/dist/index.html "$BUCKET/index.html" --cache-control no-cache
aws s3 cp apps/web/dist/config.json "$BUCKET/config.json" --cache-control no-cache
aws cloudfront create-invalidation --paths /index.html /config.json \
  --distribution-id "$(jq -r '.["CloudAttend-dev"].DistributionId' infra/cdk-outputs.json)"
```

`scripts/deploy.ts` runs exactly these steps after lint, typecheck, test, and synth.

## Access and Use

1. Open the `CloudFrontUrl`.
2. **Students** sign up with name, roll number (unique and permanent), email, and a password. The password needs 12+ characters with upper and lower case, a number, and a symbol. They then enter the 6-digit code from the email.
3. **Administrators** promote registered users to teachers on **Users & roles**.
4. **Teachers** create a course, add students by email or roll number on the **Roster** tab, and click **Start attendance**.
5. **Students** scan the code with **Scan QR code** in the app, or with the phone camera, which opens the check-in link. Signed-out students are asked to sign in and are then returned to the check-in.
6. **Teachers** watch check-ins arrive live, close the session (or let it expire), and review the **Report** tab or download CSV.

Every user is in exactly one of `STUDENT` or `TEACHER`; `ADMIN` is an extra group. The API rejects accounts with both application groups.

To develop the frontend against a deployed dev backend instead of the local server, generate `apps/web/public/config.json` from that stack and run `npm run dev`.

## Useful Commands

```bash
npm run dev:local      # Whole app locally with demo data (no AWS)
npm run lint           # Lint all workspaces
npm run typecheck      # Check TypeScript (workspaces and scripts)
npm run test           # Unit, component and infrastructure tests
npm run test:e2e       # Playwright end-to-end and accessibility tests (3 viewports)
npm run build          # Build all workspaces
npm run cdk:synth      # Generate the CloudFormation template
npm run check:secrets  # Check tracked files for common secret patterns
npm run admin:bootstrap -- you@university.edu   # Grant ADMIN in the deployed pool
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

# Upload: hashed assets are immutable; index.html and config.json must revalidate.
BUCKET=s3://$(jq -r '.["CloudAttend-dev"].FrontendBucket' infra/cdk-outputs.json)
aws s3 sync apps/web/dist/ "$BUCKET" --delete --exclude index.html --exclude config.json \
  --cache-control 'public,max-age=31536000,immutable'
aws s3 cp apps/web/dist/index.html "$BUCKET/index.html" --cache-control no-cache
aws s3 cp apps/web/dist/config.json "$BUCKET/config.json" --cache-control no-cache
aws cloudfront create-invalidation --paths /index.html /config.json \
  --distribution-id "$(jq -r '.["CloudAttend-dev"].DistributionId' infra/cdk-outputs.json)"
```

`scripts/deploy.ts` runs exactly these steps after lint, typecheck, test, and synth.

Confirm that `apps/web/public/config.json` contains `region`, `apiUrl`, `userPoolId`, and `userPoolClientId` from the same deployed stack. Never add secrets to this file.

### Sign-in works but the API returns 401 or 403

Confirm the frontend uses the correct Cognito User Pool and App Client. The user must belong to exactly one of `STUDENT` or `TEACHER`; authentication alone does not grant an application role. After a role change, the user must sign in again.

### The camera scanner does not start

Camera access needs HTTPS, or `localhost` during development, plus the browser's permission. If the camera is blocked or missing, the app explains why and offers **Enter code manually**. Students can also scan the QR code with the phone's camera app.

### Playwright cannot find a browser

Run `npx playwright install chromium`, or point `PLAYWRIGHT_CHROMIUM_PATH` at an installed Chromium.

### `/me` has no user record

Inspect the PostConfirmation Lambda logs. That trigger creates the Users-table profile, and the PreSignUp trigger reserves the roll number.

### Attendance returns `NOT_ENROLLED` or `ATTENDANCE_ALREADY_RECORDED`

`NOT_ENROLLED` means the teacher has not added the signed-in student to that course. `ATTENDANCE_ALREADY_RECORDED` means attendance for that student and session was already recorded successfully.

### A QR token expires immediately

Synchronize the teacher and student device clocks. QR tokens intentionally expire after 45 seconds, and the attendance session must still be open.

### CDK synthesis reports an IPC permission error

Run synthesis in a normal local shell or allow the TypeScript runner to create its temporary local socket. Synthesis itself does not modify AWS resources.

## Security Notes

- Never commit `.env`, AWS credentials, passwords, tokens, private keys, `apps/web/public/config.json`, `node_modules`, `dist`, or `cdk.out`.
- The browser never receives the QR signing key and never supplies a trusted student or teacher ID.
- API Gateway validates JWTs; Lambda separately checks roles, ownership, enrollment, sessions, and signed QR data.
- CloudFront sends a strict Content-Security-Policy, HSTS, `X-Frame-Options: DENY` and a Permissions-Policy. The API is throttled and access-logged.
- Cognito is SRP-only with user-existence errors suppressed, so sign-in and password reset never reveal whether an account exists.
- Development teardown deletes data. Production retains data, enables point-in-time recovery and deletion protection, and requires approval for IAM-broadening deploys.
- The local development server (`dev:local`) is for development only. It refuses to start with `NODE_ENV=production` and listens only on 127.0.0.1.

Known bugs that were fixed, and the remaining risks, are listed in [docs/bug-report.md](docs/bug-report.md). Further references: [docs/architecture.md](docs/architecture.md), [docs/api.md](docs/api.md), [docs/database.md](docs/database.md), [docs/git-workflow.md](docs/git-workflow.md).
