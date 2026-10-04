# API

All routes except `GET /health` require the API Gateway JWT authorizer.

| Method | Route | Role | Purpose |
|---|---|---|---|
| GET | `/health` | public | health result |
| GET | `/me` | authenticated | current profile |
| POST/GET | `/courses` | teacher / authenticated | create or list courses |
| PUT | `/courses/{courseId}` | owning teacher | update course |
| GET/POST | `/courses/{courseId}/students` | owning teacher | roster/enrollment |
| POST | `/courses/{courseId}/sessions` | owning teacher | start session |
| GET | `/sessions/{sessionId}/qr-token` | owning teacher | signed 45-second QR token |
| POST | `/sessions/{sessionId}/close` | owning teacher | close session |
| POST | `/attendance/check-in` | student | token-only check-in body |

Errors follow `{ "error": { "code": "...", "message": "..." } }` and use 400/401/403/404/409/422/500 as appropriate.
