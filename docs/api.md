# API

All routes except `GET /health` require the API Gateway JWT authorizer (Cognito ID token in `Authorization: Bearer …`).
Lambda re-checks the role and course/session ownership on every request. Every user is in exactly one of `STUDENT` or `TEACHER`; `ADMIN` is an additional group.

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/health` | public | Health check |
| GET | `/me` | any | Current profile with `role` and `isAdmin` |
| GET | `/me/attendance` | student | Per-course attended/total, percentage, threshold flag, and check-in history |
| GET | `/courses` | any | Teacher: own courses. Student: enrolled courses with full details and `enrolledAt` |
| POST | `/courses` | teacher | Create a course |
| GET | `/courses/{courseId}` | owner / enrolled student | Course details |
| PUT | `/courses/{courseId}` | owner | Update course fields |
| DELETE | `/courses/{courseId}` | owner | Delete the course and its enrollments (409 `SESSION_OPEN` while a session is open). Attendance history is retained |
| GET | `/courses/{courseId}/students` | owner | Roster with name, email, roll number |
| POST | `/courses/{courseId}/students` | owner | Enroll by exactly one of `{ "email" }`, `{ "rollNo" }`, or `{ "studentId" }` |
| DELETE | `/courses/{courseId}/students/{studentId}` | owner | Remove an enrollment |
| GET | `/courses/{courseId}/sessions` | owner | Session history (newest first) with effective status and `presentCount` |
| POST | `/courses/{courseId}/sessions` | owner | Start a session (`{ "durationMinutes": 1–180 }`); one open session per course |
| GET | `/courses/{courseId}/report` | owner | Per-student attendance vs. the course threshold; `?format=csv` downloads CSV |
| GET | `/sessions/{sessionId}` | owner | Session with effective status and course |
| GET | `/sessions/{sessionId}/attendance` | owner | Live list of check-ins with student details |
| GET | `/sessions/{sessionId}/qr-token` | owner | Signed QR token valid for 45 seconds |
| POST | `/sessions/{sessionId}/close` | owner | Close a session (409 if already closed) |
| POST | `/attendance/check-in` | student | `{ "token" }` only; identity comes from the JWT |
| GET | `/admin/users?role=STUDENT\|TEACHER` | admin | List users |
| POST | `/admin/users/{userId}/role` | admin | `{ "role": "STUDENT" \| "TEACHER" }`; updates Cognito groups and signs the user out everywhere |

"Effective status" means a session whose scheduled end has passed is reported as `CLOSED`, even if nobody pressed close.

Errors follow `{ "error": { "code": "...", "message": "..." } }` and use 400/401/403/404/409/422/500. CSV cells beginning with `= + - @` are prefixed with `'` to prevent spreadsheet formula injection.
