# CloudAttend Sandbox Verification Report

> **Superseded for v1.0.0.** The 2026-10-04 findings below are kept for history. The gaps they list (password reset, reports, camera scanning, dashboards, admin tooling, deploy scripts) were closed in the v1.0.0 work; see [Release verification: v1.0.0](#release-verification-v100) at the end and [`bug-report.md`](bug-report.md).

## Test environment

| Field | Value |
|---|---|
| Date | 2026-10-04 |
| Environment | `dev` only |
| AWS account | Not available; AWS CLI is not installed, so no account ID was obtained |
| AWS region/profile | Not available |
| Mode | Local-only sandbox verification |
| Node.js | v26.5.0 (project minimum is Node.js 24) |
| npm | 11.17.0 |
| Branch | `test/sandbox-verification` |
| Cloud changes | None |
| Synthetic data | In-memory records prefixed/named for sandbox testing; no real people or email delivery |

The first target check returned `command not found: aws` for `aws sts get-caller-identity`, `aws configure get region`, and `aws configure list`. Therefore Phase 4 was not attempted, no AWS resources were read or changed, and no cleanup/destruction approval was required.

## Executive summary

The original baseline built, linted, typechecked, and synthesized, but `npm run test` failed because the web workspace had no tests. Static and behavioral testing found authorization ambiguity, QR boundary defects, permissive request bodies, incomplete duplicate errors, non-atomic open-session creation, missing Cognito provisioning, missing infrastructure controls, token-redirect issues, registration validation gaps, and two serious accessibility violations. These defects were reproduced where practical and fixed in commit `5b3034c`.

The locally implemented core now passes 51 unit/component/infrastructure tests and six Chromium/axe browser tests. This is **not** evidence that the entire product specification works: reports, statistics, search, full dashboards, camera scanning, password reset, administrative scripts, deployed smoke tests, and several other requested features do not exist or could not be exercised. CloudAttend is not production-ready.

## Phase 0: baseline

| Check | Initial result | Final result | Evidence |
|---|---|---|---|
| Git status/log | PASS | PASS | Baseline was clean on `main`; verification branch created |
| `npm ci` | BLOCKED then PASS | PASS | Restricted sandbox blocked esbuild execution; approved rerun installed 365 packages |
| `npm run lint` | PASS | PASS | All four workspaces exited 0 |
| `npm run typecheck` | PASS | PASS | API, web, shared, and infra exited 0 |
| `npm run test` | FAIL | PASS | Initial web suite: “No test files found”; final: 35 API + 8 web + 8 infrastructure tests |
| `npm run build` | PASS | PASS | Vite and all TypeScript workspace builds succeeded |
| `npm run cdk:synth` | PASS | PASS | Dev CloudFormation template synthesized after Lambda bundling |

## Phase 1: static and infrastructure verification

Permanent CDK assertions are in `infra/tests/stack.test.ts`.

| Requirement | Result | Evidence/notes |
|---|---|---|
| Five DynamoDB tables, keys, GSIs, on-demand billing | PASS | CDK assertions count five tables, verify `PAY_PER_REQUEST`, and find all documented index names |
| Cognito pool, secretless client, groups, post-confirmation | FIXED | Added Node.js 24 trigger; assertions verify two groups, `GenerateSecret: false`, and `LambdaConfig.PostConfirmation` |
| HTTP API payload 2.0, JWT protection, public health | PASS | Assertions verify integration format, `ANY /{proxy+}` JWT, and `GET /health` NONE |
| Application Lambdas use Node.js 24 | FIXED | API and post-confirmation functions synthesize as `nodejs24.x` |
| Independent application Lambda roles | PASS (limited architecture) | API and post-confirmation functions have separate roles; QR/check-in/report are not separate Lambdas |
| Explicit log retention | FIXED | Two application log groups retain 30 days |
| IAM least privilege | PARTIAL/FAIL | No AdministratorAccess or exact `Action: "*"`; post-confirmation is narrowed. The monolithic API role still has broad read/write access across all tables/report bucket because routes share one function. Per-QR/check-in/report roles cannot be proven because those functions do not exist separately |
| Frontend S3 private and CloudFront OAC | PASS | Public-access block assertion and OAC assertion pass; synthesized SSL-deny policy is not a public allow |
| Reports S3 private, encrypted, lifecycle | FIXED | Added 30-day expiry; assertions pass |
| Generated Secrets Manager secret, no source secret | PASS | 64-character generated secret assertion; source/history scans found no key |
| Production retention and PITR | PASS | Prod-context assertions verify `Retain` and PITR on all five tables |
| Dev destruction convenience | PASS | Dev synth uses deletion policies and bucket auto-delete custom resources |
| Project/environment/management tags | PARTIAL | Application/taggable resources inherit tags. Not every CDK-generated support resource can be asserted to carry all tags |
| CloudWatch alarms | FIXED | Lambda Errors alarm added and asserted |
| CloudFront security headers | FIXED | Response headers policy adds HSTS, nosniff, frame deny, referrer policy, and XSS protection |
| Restricted CORS | FIXED LOCALLY | Dev allows the CloudFront origin token and `http://localhost:5173`; wildcard origin removed |

Infrastructure test result: **8 tests passed, 0 failed**.

## Phase 2: backend unit and integration tests

### Auth and RBAC

| Item | Result |
|---|---|
| Student/teacher claims recognized | PASS |
| Missing, empty, malformed, or both application groups rejected | FIXED/PASS |
| Student rejected by teacher operation; teacher rejected by check-in | PASS |
| API Gateway rejects invalid JWT before Lambda | NOT TESTED locally; verified only as synthesized authorizer configuration |
| Every route/role combination | PARTIAL; implemented protected routes covered, absent product routes cannot be tested |

### QR tokens

Valid payloads, modified payload/signature, extra/truncated segments, empty tokens, invalid encoding, wrong secrets, exact expiry boundary, future `iat` beyond 30-second skew, and `none`-style input are covered. Timing-safe comparison remains in code. Result: **PASS for implemented token behavior**.

Two-token `jti` uniqueness is structurally provided by `randomUUID`, but the route-level uniqueness case was not separately asserted with the production runtime.

### Check-in and concurrency

Covered cases include happy path, rejection of unexpected client identity fields, not enrolled, missing/closed/expired-window sessions, signed-course mismatch, duplicate attendance, SDK-error non-disclosure, and 20 simultaneous check-ins. Exactly one concurrent check-in succeeds in the in-memory integration adapter.

Open-session creation now uses a DynamoDB transaction containing an expiring course lock and session write. The in-memory race test sends 20 starts and verifies one 201 plus nineteen 409 responses. Result: **FIXED/PASS locally; live DynamoDB behavior unverified**.

### Courses, enrollment, sessions

Teacher-B IDOR tests cover course read/update, roster read/enroll, session start, QR fetch, and close. Enrollment removal and already-closed handling were implemented. Duplicate enrollment has dedicated application handling but is not separately counted in the current test file. Report IDOR cannot be tested because reports are absent. Roll-number uniqueness is implemented as a transactional claim in the post-confirmation Lambda but was not exercised against DynamoDB Local or AWS. Result: **PARTIAL**.

### Validation and error safety

Strict Zod objects now reject unexpected identity fields. Tests cover malformed JSON, oversized strings, wrong types, object injection input, SQL-like text, null bytes, stable error envelopes, and non-disclosure of DynamoDB conditional error names. Query/route parameter UUID validation is enabled for implemented item routes. Search validation cannot be tested because search is absent. Result: **PASS for implemented routes; FAIL for absent search**.

### Reports, stats, and SES

| Area | Result | Reason |
|---|---|---|
| Percentage/status math | FAIL / NOT IMPLEMENTED | No stats service or routes |
| CSV escaping/formula defense | FAIL / NOT IMPLEMENTED | No CSV report implementation |
| Presigned report URL | FAIL / NOT IMPLEMENTED | No report handler |
| SES disabled/enabled failure paths | NOT TESTED / NOT IMPLEMENTED | No SES integration; notifications remain disabled |

### Coverage

`npm run test:coverage` results:

| Workspace/file | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| API `core.ts` | 73.76% | 74.82% | 100% | 75.72% |
| Web `main.tsx` | 23.75% | 27.27% | 22.22% | 41.66% |

Critical uncovered areas include API routes not yet implemented, the AWS handler/trigger adapters, and most authenticated frontend dashboard/session behavior.

## Phase 3: frontend and browser testing

### Component tests

Eight Vitest/Testing Library cases pass:

- labeled required login controls;
- successful credential submission to the mocked Cognito boundary;
- registration password-mismatch rejection before Cognito; and
- friendly messages for expired QR, duplicate attendance, not enrolled, closed session, and network failure.

Token preservation was fixed by redirecting to `/login?returnTo=<original check-in URL>` and returning after sign-in. A dedicated browser test for the full preserved-token flow is still missing. Student/teacher dashboards, password reset, protected role redirects, dashboard metrics, and detailed loading/empty/error views are absent or untested.

### Playwright and axe

System Chromium was run against the real local Vite server with a non-secret sandbox `config.json`. Six tests passed:

| Page | 375×667 | 768×1024 | 1440×900 |
|---|---|---|---|
| Login | PASS | PASS | PASS |
| Registration | PASS | PASS | PASS |

Every test checks heading visibility, horizontal overflow, and axe serious/critical violations. The first run failed all six tests because the document lacked both `<title>` and `lang`; the fixed rerun reported **6 passed in 12.5 seconds** with no serious/critical axe violations.

Screenshot locations (ignored test artifacts):

- `test-results/public-pages--login-is-responsive-and-accessible-mobile-chromium/login.png`
- `test-results/public-pages--login-is-responsive-and-accessible-tablet-chromium/login.png`
- `test-results/public-pages--login-is-responsive-and-accessible-desktop-chromium/login.png`
- `test-results/public-pages--register-is-responsive-and-accessible-mobile-chromium/register.png`
- `test-results/public-pages--register-is-responsive-and-accessible-tablet-chromium/register.png`
- `test-results/public-pages--register-is-responsive-and-accessible-desktop-chromium/register.png`

Firefox/WebKit was **NOT TESTED** because neither browser is installed. Camera tests, authenticated role flows, session/result/report flows, back/forward mid-session, and manual keyboard focus-trap testing were **NOT TESTED or FAIL due to absent UI/features**.

### Bundle

The production build reported:

- JavaScript: 457,529 bytes raw / 140.90 kB gzip.
- CSS: 1,058 bytes raw / 0.56 kB gzip.
- HTML: approximately 0.4 kB.

The single JavaScript chunk is large for the current feature set. Route-level splitting is recommended before scanner/chart dependencies are actually used.

## Phase 4: deployed sandbox testing

**NOT TESTED.** AWS CLI/credentials were unavailable. The following have no deployed evidence:

- deploy, seed, teacher creation, smoke test, and script idempotency;
- real Cognito email verification or tokens;
- live API black-box, replay/forgery, cross-tenant, pagination, throttling, and timing tests;
- S3 public-access behavior, CloudFront routing/headers, live CORS, and secret/IAM simulation;
- DynamoDB transaction/conditional behavior in AWS;
- CloudWatch logs, secret/JWT log searches, alarms, and retention;
- deployment no-op/update lifecycle and stack reproducibility;
- cleanup/list-by-tag.

No `sbx-` cloud data or resources were created, so there was nothing to delete. `cdk destroy` was not requested or run.

## Phase 5: security review

### Dependency audit

Initial audit: 4 findings (3 moderate, 1 high). Vitest and its coverage provider were upgraded from v3 to v5, removing the three moderate test-tool findings. One high advisory remains in `brace-expansion@5.0.9`, bundled beneath `aws-cdk-lib@2.272.0`. npm cannot override or automatically update this bundled copy. It is used by the local CDK infrastructure toolchain, not included in the application Lambda bundle or frontend, but remains a real build-time denial-of-service finding and must be updated when AWS CDK publishes a fixed bundle.

### Secret and tracked-file review

- `npm run check:secrets`: PASS.
- Manual full-history pattern scan across all five baseline commits: PASS.
- Full-history forbidden-path scan (`.env`, demo credentials, `cdk.out`, `node_modules`, runtime config): PASS.
- `git ls-files` forbidden-path check: PASS.
- `gitleaks`: NOT TESTED; executable not installed.
- Source search found no `localStorage` or `sessionStorage` use by CloudAttend code.

AWS Amplify Auth manages browser token persistence internally and typically uses browser storage. This reduces sign-in friction but makes strong XSS prevention essential; CloudAttend should add a restrictive Content Security Policy and keep dependencies/current rendering paths free from unsafe HTML.

Passwords are passed only from forms to Cognito Auth APIs. Source inspection found no password logging or application persistence. Registration may still expose Cognito's account-existence behavior through raw Cognito error text; enumeration-resistant copy/rate limiting was not implemented or live-tested.

## Bugs found and fixed

All fixes below are included in commit `5b3034c`.

| ID | Severity | Defect/root cause | Reproduction/evidence | Fix |
|---|---|---|---|---|
| SBX-001 | High | Users with both Cognito groups were accepted because authorization only checked `includes` | Unit test with both groups | Require exactly one recognized application group |
| SBX-002 | High | Concurrent session starts used query-then-put, allowing multiple UUID sessions | 20-request race design review/test | DynamoDB transactional active-course lock plus session write |
| SBX-003 | High | Cognito confirmation did not provision users/groups or enforce concurrent roll uniqueness | CDK assertion initially absent | Node.js 24 post-confirmation Lambda and transactional roll claim |
| SBX-004 | Medium | QR exact-expiry boundary was accepted (`<` rather than `<=`) and future `iat` was unchecked | Deterministic-clock tests | Exact boundary rejection and documented 30-second skew |
| SBX-005 | Medium | Loose QR parsing accepted insufficient payload structure | Malformed/truncated/encoding tests | Strict two-segment base64url and strict Zod payload validation |
| SBX-006 | Medium | Unexpected client identity fields were silently accepted | Check-in body with student/role/course fields | Strict request schemas return 422 before storage |
| SBX-007 | Medium | All conditional failures returned a generic attendance message | Duplicate enrollment/check-in review | Operation-specific 409 codes and safe messages |
| SBX-008 | Medium | Enrollment removal was a hardcoded 501 | Route exercise | Conditional delete with ownership and not-found handling |
| SBX-009 | Medium | QR secret was resolved into Lambda environment rather than fetched at runtime | Infrastructure/source review | Secret ARN environment plus cached Secrets Manager fetch |
| SBX-010 | Medium | Node.js 22, no explicit logs/alarms/report lifecycle, wildcard CORS, no security headers | Synth inspection/assertions | Node 24, 30-day logs, alarm, report expiry, restricted origins, response headers policy |
| SBX-011 | Medium | Logged-out check-in redirect discarded the token | Frontend routing review | Encoded `returnTo` URL and post-login return; token removed after success |
| SBX-012 | Medium | Registration had no password-confirmation field | Component test | Confirm field and pre-Cognito mismatch validation |
| SBX-013 | Medium | Web workspace had no tests, causing root baseline failure | Initial `npm run test` | Testing Library suite added |
| SBX-014 | Medium | HTML had no document title or language | Six Playwright/axe failures | Standards-compliant HTML shell with title, language, viewport, description |

## Known failures and limitations

- Product features listed in the root README's Known gaps remain absent.
- The API is monolithic, so fine-grained per-operation IAM requested for QR/check-in/report Lambdas is impossible in the current architecture.
- The open-session transaction is locally modeled and synthesized but not proven against real DynamoDB.
- Post-confirmation behavior and roll uniqueness are not tested with mocked AWS SDK clients or AWS.
- No report/stat/SES tests can pass because those services do not exist in application code.
- Frontend coverage is low and authenticated workflows are mostly untested.
- Only Chromium was available.
- No camera/fake-media fixture was available.
- No deployed performance, throttling, log, alarm, or teardown evidence exists.
- One high build-time dependency advisory remains in CDK's bundled dependency.
- The app is not production-ready.

## Reproduction commands

```bash
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
npm run cdk:synth
npm run test:e2e
npm run check:secrets
npm audit
```

Deployed commands are present in the project specification but cannot currently be rerun because `deploy:dev`, `seed:demo`, and `smoke:test` root scripts are not implemented and AWS tooling is unavailable.

## Git summary

Verification work began from commit `58ac38b` on branch `test/sandbox-verification`. Commit added before this report:

```text
5b3034c fix: harden attendance security and sandbox coverage
```

No release tag was created because required features and deployed verification are incomplete. The branch must not be merged as a claim of complete production verification; merge only if the locally verified hardening changes are desired.

## Release verification: v1.0.0

| Field | Value |
|---|---|
| Date | 2026-10-10 |
| Environment | Local only (no AWS CLI or credentials; nothing deployed) |
| Browser | Chromium (Playwright), three viewports: mobile, tablet, desktop |

| Gate | Result |
|---|---|
| `npm run check:secrets` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` (all workspaces + scripts) | PASS |
| API tests (vitest) | 92 passed |
| Web component tests (vitest + Testing Library + MSW) | 86 passed |
| Infrastructure assertions (CDK) | 11 passed |
| `npm run build` | PASS; prod bundle contains no local-auth code or demo credentials |
| `npm run cdk:synth` | PASS |
| `npm run test:e2e` (Playwright + axe) | 54 passed (18 tests × 3 viewports) |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run dev:local` smoke test | PASS after fixing BUG-19 (web 200, `/me` unauthenticated 401, demo teacher sign-in and course list OK) |

The E2E journeys cover sign-up with code confirmation, duplicate roll numbers, sign-in, forgot password, sign-out, and the open-redirect guard. They also cover a teacher creating a course, enrolling by email and roll number, starting a session, and showing the QR code; QR rotation is covered by a fake-timer component test. The student checks in through both the link and pasted-token paths, and duplicate check-ins are rejected. Finally, the teacher sees the live list, closes the session, and views the report and CSV. An administrator promotes a user, and every page shows no serious or critical axe violations, with student pages also audited in dark mode.

**Not verified:** behaviour on a deployed AWS stack, including Cognito email delivery, the real JWT authorizer, DynamoDB transactions, and CloudFront headers. Camera scanning was verified only up to the scanner component, not with a real camera. Follow the README's post-deployment smoke test after the first deploy.
