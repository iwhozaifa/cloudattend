# Database

All tables use on-demand capacity and UTC ISO timestamps.

| Table | Key | Indexes | Access pattern |
|---|---|---|---|
| Users | `userId` | `email-index`, `rollNo-index` | identity and administrative lookup |
| Courses | `courseId` | `teacherId-index` | teacher dashboard |
| Enrollments | `courseId`, `studentId` | `studentId-index` | roster and student courses |
| Sessions | `sessionId` | `courseId-index` | course history |
| Attendance | `sessionId`, `studentId` | `courseId-index` | duplicate-safe check-in and reporting |

The attendance composite key makes a duplicate check-in a conditional-write conflict rather than a race.
