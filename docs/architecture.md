# Architecture

```mermaid
flowchart LR
U[Users]-->CF[CloudFront + CSP headers]-->S3[Private S3 frontend]
U-->C[Cognito User Pool<br/>STUDENT / TEACHER / ADMIN groups]
C-->PS[PreSignUp Lambda<br/>roll-number claim]
C-->PC[PostConfirmation Lambda<br/>profile + STUDENT group]
U-->API[HTTP API<br/>JWT authorizer, throttling, access logs]-->L[API Lambda]
L-->D[DynamoDB tables]
L-->SM[Secrets Manager QR key]
L-->C
PS-->D
PC-->D
```

```mermaid
sequenceDiagram
Teacher->>API: create session
loop every ~35 s while open
Teacher->>API: request QR token
API->>SM: read signing key (cached)
API-->>Teacher: 45-second signed token
end
Student->>API: check-in with JWT + token
API->>API: verify JWT, role and HMAC expiry
API->>DynamoDB: validate enrollment and session
API->>DynamoDB: conditional attendance write
API-->>Student: attendance recorded
Teacher->>API: poll live attendees
```

- The browser never receives the HMAC key. API Gateway validates JWTs, and the Lambda enforces roles and course ownership again.
- Users are in exactly one of `STUDENT` or `TEACHER`. `ADMIN` is an additional group, checked by `requireAdmin`. A role change removes and adds groups, updates `Users.role`, and globally signs the user out so the new groups take effect.
- The Cognito app client uses SRP only, prevents user-existence errors, and recovers accounts by email.
- PostConfirmation only acts on `PostConfirmation_ConfirmSignUp`, so a password reset never changes a user's groups.
- Reports are built in the Lambda and returned inline as JSON or CSV; no report bucket exists.

## Local mode

`npm run dev:local` runs `apps/api/src/local-server.ts`, a Node HTTP server that wraps the same `route()` function with the in-memory store and a fake user directory. It is paired with the web app's local auth adapter. Both exist only in `vite --mode demo|e2e`; the production bundle contains neither, which a CI step checks. Playwright runs against this mode.
