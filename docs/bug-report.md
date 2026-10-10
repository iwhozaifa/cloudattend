# CloudAttend bug and vulnerability report

| Field | Value |
|---|---|
| Date | 2026-10-10 |
| Baseline | `9806bf7` (main before this work) |
| Scope | API (`apps/api`), web app (`apps/web`), shared contracts, CDK infrastructure, scripts, dependencies |
| Method | Code review of every source file, new unit, component, and infrastructure tests, Playwright end-to-end runs against the real API router, axe accessibility audits, and `npm audit` |
| Environment | Local only. No AWS account or CLI was available, so nothing was deployed and AWS-side behaviour is verified by CDK assertions, not by a live stack |

Severity follows a simple scale. **Critical**: the core flow cannot work, or a security boundary is broken. **High**: a major feature is broken, or there is a realistic security impact. **Medium**: degraded behaviour or a defence-in-depth gap. **Low**: hardening or hygiene.

Each finding below lists where it was fixed and which test now protects it.

## Summary

| ID | Severity | Area | Finding | Status |
|---|---|---|---|---|
| BUG-01 | Critical | API auth | JWT group claim format from HTTP API was not parsed, so every role check would return 403 once deployed | Fixed |
| BUG-02 | Critical | Cognito trigger | Password reset added teachers to `STUDENT`, which locked them out (403 everywhere); teachers without a roll number crashed the trigger | Fixed |
| BUG-03 | High | Deployment | `scripts/deploy.ts` crashed (top-level `await` compiled as CommonJS) and never published the frontend | Fixed |
| BUG-04 | High | Web | Teacher QR code was fetched once and never refreshed; it was dead after 45 s | Fixed |
| BUG-05 | High | Sign-up | A duplicate roll number left a confirmed Cognito user with no profile and no group | Fixed |
| BUG-06 | High | Web | Check-in fired twice under React StrictMode, so success showed "already recorded"; it also fired with no token | Fixed |
| BUG-07 | High | API | Closing an expired session after a newer one started returned 500; concurrent closes returned 500 | Fixed |
| BUG-08 | High | API/Web | Student dashboard rendered blank cards (enrollment rows had no course data) | Fixed |
| BUG-09 | High | Web | Sign-out left the previous user's data on screen and on the sign-in redirect | Fixed |
| SEC-01 | Medium | Web | Open redirect through `returnTo` after sign-in | Fixed |
| SEC-02 | Medium | Cognito | User enumeration (`PreventUserExistenceErrors` not enabled) | Fixed |
| SEC-03 | Medium | CloudFront | No Content-Security-Policy or Permissions-Policy; legacy XSS auditor enabled | Fixed |
| SEC-04 | Medium | API Gateway | No throttling and no access logs (cost/DoS exposure, no audit trail) | Fixed |
| SEC-05 | Medium | Web | After sign-out, the next person on a shared computer was sent to the previous user's last page | Fixed |
| SEC-06 | Low | Cognito | Plain `USER_PASSWORD_AUTH` flow enabled although the app uses SRP | Fixed |
| SEC-07 | Low | IAM | Post-confirmation trigger could add users to groups in any user pool in the account | Fixed |
| SEC-08 | Low | Cognito | Changing email took effect before the new address was verified | Fixed |
| SEC-09 | Low | Data | Production DynamoDB tables had no deletion protection | Fixed |
| SEC-10 | Low | Supply chain | `brace-expansion` advisory (bundled in `aws-cdk-lib`) | Fixed by upgrade |
| BUG-10 | Medium | Web | `/me` failures of any kind (network, 403, 500) redirected to sign-in and could loop | Fixed |
| BUG-11 | Medium | Web | Sign-in ignored Cognito next steps (unverified email, new-password challenge, forced reset) | Fixed |
| BUG-12 | Medium | Web | Email-code confirmation had no error handling, no resend, and forced a full page reload | Fixed |
| BUG-13 | Medium | API | Enrollment required the student's internal UUID; the roster had no names | Fixed |
| BUG-14 | Medium | API | Expired sessions stayed `OPEN` forever in listings | Fixed |
| BUG-15 | Medium | Accessibility | Contrast failures (muted text, destructive buttons), invalid ARIA on filter tabs, tablet overflow | Fixed |
| BUG-16 | Low | Web | A wrong verification code stayed in the OTP boxes, so retyping produced a corrupted code | Fixed |
| BUG-17 | Low | API | Conditional writes picked the key attribute by object property order | Fixed |
| BUG-18 | Low | Repo | Dead reports bucket and unused S3/zxing dependencies; hard-coded Chromium path in Playwright | Fixed |
| BUG-19 | Low | Tooling | `npm run dev:local` crashed: Vite rejects `--mode local` (clashes with `.env.local`) | Fixed |

## Critical

### BUG-01: Role checks fail on the deployed API

- **Where:** `apps/api/src/core.ts` `identity()`.
- **Problem:** The HTTP API JWT authorizer passes array claims to Lambda as a flattened string such as `"[TEACHER]"` or `"[STUDENT ADMIN]"`. The parser split on commas only, so `"[TEACHER]"` became a group literally named `[TEACHER]` and matched no role.
- **Impact:** Every authenticated route except `/health` would answer 403 after deployment. Unit tests had passed because they used plain strings and arrays.
- **Fix:** The parser now strips the brackets and splits on whitespace or commas.
- **Test:** `routes.test.ts › parses the bracketed space-separated form…`.

### BUG-02: Password reset locks teachers out

- **Where:** `apps/api/src/post-confirmation.ts`.
- **Problem:** Cognito also fires PostConfirmation after `ConfirmForgotPassword`. The trigger always ran `AdminAddUserToGroup STUDENT`.
- **Impact:**
  - A teacher who reset a password ended up in both groups, and `requireAuthenticated` rejects ambiguous roles, so every request returned 403.
  - Teachers without `custom:rollNo` crashed the trigger with `undefined.trim()`, so their reset failed.
- **Fix:** The trigger acts only on `PostConfirmation_ConfirmSignUp` and validates the roll number.
- **Test:** `triggers.test.ts › does nothing after a forgotten-password confirmation`.

## High

### BUG-03: Deployment script could not run

- **Problem:** The repo root is CommonJS, so `tsx` compiled `scripts/*.ts` as CJS. `generate-web-config.ts` used top-level `await` and failed with "Top-level await is currently not supported with the cjs output format".
- **Impact:** The documented `npx tsx scripts/deploy.ts` deployed the stack and then crashed. The script never uploaded the web app or invalidated CloudFront either.
- **Fix:**
  - Added `scripts/package.json` with `"type": "module"`.
  - `deploy.ts` now uploads hashed assets as immutable, serves `index.html`/`config.json` as `no-cache`, and invalidates CloudFront.
  - Scripts are now part of `npm run typecheck`.

### BUG-04: QR code never refreshed

- **Problem:** `Course` in the old `main.tsx` fetched one token, but tokens expire after 45 s. The UI claimed "QR refreshes automatically".
- **Fix:** `useQrToken` refetches 10 s before expiry. The live page shows a countdown and full-screen mode.
- **Test:** `live-session.test.tsx` checks that the token rotates. E2E covers the full flow.

### BUG-05: Duplicate roll numbers left orphaned accounts

- **Problem:** Uniqueness was enforced only in PostConfirmation, after Cognito had already confirmed the user. The transaction failure left a confirmed user with no profile and no group.
- **Fix:** A new **PreSignUp** trigger (`pre-sign-up.ts`) reserves `ROLL#<roll>` with a conditional write before the account is created. Pending reservations expire after 24 h, and PostConfirmation upgrades the claim.
- **Tests:** `triggers.test.ts`, and the e2e test "duplicate roll numbers are rejected at sign-up".

### BUG-06: Check-in double submit

- **Problem:** The `useEffect` in `CheckIn` ran twice under StrictMode. The second call returned 409, so a successful check-in displayed "already recorded". With no `token` parameter it still showed "Recording attendance…".
- **Fix:** The submission is guarded by a ref, the token is removed from the address bar immediately, and a missing token shows the scanner instead.
- **Test:** `check-in.test.tsx › submits the token exactly once under StrictMode`.

### BUG-07: Closing sessions could return 500

- **Problem:** `closeSession` deleted the `ACTIVE#course` lock inside a transaction with a condition. Once a newer session owned the lock (allowed after expiry), the transaction failed and returned 500. Two simultaneous closes also returned 500.
- **Fix:** The session update is conditional on `status = OPEN`, and the lock release tolerates a lock held by another session. A conditional failure maps to 409.
- **Tests:** `core.test.ts › closes an expired session even after a newer session took the course lock` and `› maps a concurrent close race to 409`.

### BUG-08: Blank student dashboard

- **Problem:** `GET /courses` for students returned enrollment rows, which have no `courseName` or `courseCode`.
- **Fix:** Course details are now joined with BatchGet.
- **Test:** `routes.test.ts › lists a student's courses with full course details`.

### BUG-09: Sign-out did not sign the UI out

- **Problem:** `queryClient.clear()` detached the auth query observer, so the app kept rendering the previous user. `/sign-in` then redirected straight back into the app.
- **Fix:** `me` is set to `null` in place, and the other cached queries are then removed.
- **Tests:** `guards.test.tsx › sign out`, confirmed to fail on the old code, plus e2e sign-out tests.

## Security (Medium and Low)

- **SEC-01: Open redirect.**
  - **Problem:** `navigate(params.get('returnTo'))` accepted any value.
  - **Fix:** `safeReturnTo()` allows only same-origin absolute paths and rejects `//`, `/\`, schemes, and auth pages.
  - **Tests:** `return-to.test.ts`, and the e2e test "an off-site returnTo is ignored".
- **SEC-02: User enumeration.**
  - **Problem:** Without `PreventUserExistenceErrors`, Cognito answered "user does not exist" differently from "wrong password", and password reset revealed whether an account existed.
  - **Fix:** The setting is enabled, and the reset UI wording is neutral.
- **SEC-03: Missing browser hardening headers.**
  - **Fix:** Added a strict CSP:
    - `default-src 'self'`
    - `script-src 'self' 'wasm-unsafe-eval'` (for the self-hosted QR decoder)
    - `connect-src` limited to API Gateway and Cognito in the stack's region
    - `frame-ancestors 'none'`
  - Also added `Permissions-Policy` (camera only for self), a TLS 1.2 minimum, and `X-XSS-Protection: 0` per current OWASP guidance.
- **SEC-04: No API throttling or audit logs.**
  - **Fix:** Stage throttling (burst 200, rate 100/s), JSON access logs with 30-day retention, and a 5xx alarm.
- **SEC-05: Shared-computer leak.**
  - **Problem:** After an explicit sign-out, the redirect carried `returnTo` of the previous user's page.
  - **Fix:** Explicit sign-out now goes to a plain `/sign-in`.
  - **Test:** `guards.test.tsx`, plus the e2e admin flow.
- **SEC-06: Unneeded auth flow.**
  - **Fix:** `ALLOW_USER_PASSWORD_AUTH` was removed (SRP only). Token revocation is enabled and token lifetimes are explicit.
- **SEC-07: Over-broad IAM grant.**
  - **Problem:** The trigger's grant covered `userpool/*`.
  - **Fix:** A standalone IAM policy references the pool ARN without creating a circular dependency.
  - **Test:** `stack.test.ts › scopes the post-confirmation group grant`.
- **SEC-08: Unverified email changes.**
  - **Fix:** `keepOriginal: { email: true }`.
- **SEC-09: No deletion protection on production tables.**
  - **Fix:** Enabled for `prod`.
- **SEC-10: Dependencies.**
  - **Fix:** `aws-cdk-lib` was upgraded to 2.273 to clear the bundled `brace-expansion` advisory. `npm audit --omit=dev` now reports **0 vulnerabilities**, and CI enforces it.
  - **Remaining:** `npm audit` still lists `braces` through the dev-only `shadcn` CLI (used only to add components). There is no fixed version upstream. It is not shipped and is accepted.

### Defences added with the new features

These were not defects in the old code, but they are the security-relevant decisions in the new code:

- **CSV export:** Cells starting with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection (CWE-1236).
- **QR scanner:**
  - It never follows the URL inside a QR code; it only extracts a token from it.
  - The decoder WASM is served from our own origin. The library's default loads it from a public CDN, which the CSP would block and which would leak usage.
- **Admin API:**
  - Requires the `ADMIN` group.
  - Rejects changing your own role and touching roll-claim records.
  - Signs the target user out everywhere so stale tokens lose the old role.
- **Local dev server:**
  - Refuses `NODE_ENV=production` and binds to 127.0.0.1.
  - Sends CORS headers only for local origins.
  - Is excluded from the Lambda bundle.
  - The local auth adapter is compiled out of production builds (a CI step greps `dist`).

## Medium and Low functional bugs

- **BUG-10:** `Shell` redirected to `/login` on any `/me` error, which could loop. Now only a 401 means signed out; other errors show a retry panel (`guards.test.tsx`).
- **BUG-11:** Sign-in now handles:
  - `CONFIRM_SIGN_UP`: resends the code and opens the verify step.
  - `CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED`: inline new-password form.
  - `RESET_PASSWORD`: sends a code and opens the reset step.
  - `UserAlreadyAuthenticatedException`: clears the stale session and retries.
  - Tests: `sign-in.test.tsx`, `amplify-adapter.test.ts`.
- **BUG-12:** Confirmation now uses a 6-digit InputOTP, friendly Cognito error messages, a rate-limited resend, and in-app navigation.
- **BUG-13:** Enrollment accepts an email or roll number through the existing GSIs. The roster and report join student names.
- **BUG-14:** Listings and the live page compute the effective status: past `scheduledEndTime` means `CLOSED`.
- **BUG-15:** Darkened the `--muted-foreground` and `--destructive` tokens to meet WCAG AA, gave the admin filter tabs a real tab panel, and fixed a flex `min-width` overflow on tablets. axe reports no serious or critical violations on any page at three viewports (student pages are also audited in dark mode).
- **BUG-16:** A failed code clears the OTP field and refocuses it.
- **BUG-17:** `Store.put`/`delete` take the key attribute name explicitly instead of `Object.keys(item)[0]`.
- **BUG-18:** Removed the unused reports bucket, the S3 SDKs and `@zxing/browser`. Playwright reads `PLAYWRIGHT_CHROMIUM_PATH`.
- **BUG-19:** Found by smoke-testing `npm run dev:local` (E2E uses `--mode e2e`, so it never hit this). The demo mode is now `--mode demo`. A CI step also fails the build if local-auth code or the demo password appears in the production bundle; the step was checked against an `e2e` build, which it correctly flags.

## Residual risks and known limitations

- **Proxy attendance:** A student can still forward a live QR link to an absent classmate within its 45-second window. Shorter tokens, location checks, or device binding would reduce this. None are implemented, as they need a product decision.
- **No live AWS verification:** Nothing was deployed in this session. The first deployment should be followed by a smoke test: sign-up, email, sign-in, a teacher session, check-in, and the CSV export.
- **Email delivery:** Cognito's default email sender is limited to about 50 messages a day. Configure Amazon SES for production.
- **Profile sync:** Name changes made directly in Cognito are not copied to the Users table. The app has no UI for them.
- **Course deletion:** Deleting a course keeps its attendance records for audit. There is no restore.
