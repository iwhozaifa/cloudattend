# Database

All tables use on-demand capacity and UTC ISO timestamps. In `prod`, every table has point-in-time recovery, deletion protection, and a `RETAIN` removal policy; `dev` tables are destroyed with the stack.

| Table | Key | Indexes | Access pattern |
|---|---|---|---|
| Users | `userId` | `email-index`, `rollNo-index`, `role-index` (`role` + `email`) | profiles, enroll by email/roll number, admin user list by role |
| Courses | `courseId` | `teacherId-index` | teacher dashboard |
| Enrollments | `courseId`, `studentId` | `studentId-index` (`studentId` + `courseId`) | roster and student courses |
| Sessions | `sessionId` | `courseId-index` (`courseId` + `startTime`) | course session history |
| Attendance | `sessionId`, `studentId` | `courseId-index` (`courseId` + `checkInTime`), `studentId-index` (`studentId` + `checkInTime`) | duplicate-safe check-in, course reports, student history |

## Special items

| Item | Table | Purpose |
|---|---|---|
| `ROLL#<ROLLNO>` | Users | Roll-number uniqueness claim. The PreSignUp trigger writes it as `PENDING` (expires after 24 hours if the account is never confirmed); PostConfirmation marks it `CONFIRMED` in the same transaction that creates the profile. A duplicate roll number is rejected *before* a Cognito account exists. |
| `ACTIVE#<courseId>` | Sessions | One-open-session-per-course lock, written in a transaction with the new session. Closing a session removes the lock only if it still points at that session, so closing an old, expired session never fails or releases a newer one. |

## Invariants

- The attendance composite key makes a duplicate check-in a conditional-write conflict (409), not a race.
- A session is effectively closed once `scheduledEndTime` passes, even if its stored status is still `OPEN`; every read computes the effective status.
- Conditional writes name the key attribute explicitly (`ifAbsent` / `ifExists`) rather than inferring it from item property order.
