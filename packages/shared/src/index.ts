import { z } from 'zod';

export const roles = ['STUDENT', 'TEACHER'] as const;
export const RoleSchema = z.enum(roles);
export type Role = z.infer<typeof RoleSchema>;
export const ADMIN_GROUP = 'ADMIN';
export const SessionStatusSchema = z.enum(['OPEN', 'CLOSED']);
export const AttendanceStatusSchema = z.literal('PRESENT');

/** Mirrors the Cognito password policy configured in infra so the browser can explain failures up front. */
export const PASSWORD_MIN_LENGTH = 12;
export const passwordRules = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (value: string) => value.length >= PASSWORD_MIN_LENGTH },
  { id: 'lower', label: 'A lowercase letter', test: (value: string) => /[a-z]/.test(value) },
  { id: 'upper', label: 'An uppercase letter', test: (value: string) => /[A-Z]/.test(value) },
  { id: 'digit', label: 'A number', test: (value: string) => /\d/.test(value) },
  { id: 'symbol', label: 'A symbol', test: (value: string) => /[^A-Za-z0-9\s]/.test(value) }
] as const;
export const PasswordSchema = z.string().max(128).superRefine((value, context) => {
  for (const rule of passwordRules) {
    if (!rule.test(value)) context.addIssue({ code: z.ZodIssueCode.custom, message: `Password needs ${rule.label.toLowerCase()}.` });
  }
});
export const EmailSchema = z.string().trim().email('Enter a valid email address.').max(254).transform((v) => v.toLowerCase());
export const RollNoSchema = z.string().trim().min(2, 'Roll number must be at least 2 characters.').max(64).transform((v) => v.toUpperCase());

export const CreateCourseSchema = z.object({
  courseCode: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  courseName: z.string().trim().min(2).max(120),
  semester: z.string().trim().min(2).max(50),
  section: z.string().trim().min(1).max(20),
  attendanceThreshold: z.number().int().min(1).max(100).default(75)
}).strict();
export const UpdateCourseSchema = CreateCourseSchema.partial();
export const EnrollStudentSchema = z.union([
  z.object({ studentId: z.string().uuid() }).strict(),
  z.object({ email: EmailSchema }).strict(),
  z.object({ rollNo: RollNoSchema }).strict()
]);
export const StartSessionSchema = z.object({ durationMinutes: z.number().int().min(1).max(180).default(10) }).strict();
export const CheckInSchema = z.object({ token: z.string().min(20).max(4096) }).strict();
export const SetRoleSchema = z.object({ role: RoleSchema }).strict();
export const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: EmailSchema,
  rollNo: RollNoSchema,
  password: PasswordSchema
}).strict();

export type User = { userId: string; email: string; name: string; rollNo?: string; role: Role; createdAt: string; updatedAt: string };
export type Me = User & { isAdmin: boolean };
export type Course = z.infer<typeof CreateCourseSchema> & { courseId: string; teacherId: string; createdAt: string; updatedAt: string };
export type StudentCourse = Course & { enrolledAt: string };
export type AttendanceSession = { sessionId: string; courseId: string; teacherId: string; startTime: string; scheduledEndTime: string; actualEndTime?: string; status: 'OPEN' | 'CLOSED'; tokenLifetimeSeconds: number; createdAt: string };
export type SessionSummary = AttendanceSession & { presentCount: number };
export type RosterEntry = { courseId: string; studentId: string; enrolledAt: string; name?: string; email?: string; rollNo?: string };
export type AttendanceRecord = { sessionId: string; studentId: string; courseId: string; teacherId: string; checkInTime: string; status: 'PRESENT'; createdAt: string };
export type SessionAttendee = AttendanceRecord & { name?: string; email?: string; rollNo?: string };
export type QrToken = { token: string; issuedAt: number; expiresAt: number };
export type ReportRow = { studentId: string; name?: string; email?: string; rollNo?: string; attended: number; totalSessions: number; percentage: number; belowThreshold: boolean };
export type CourseReport = { course: Course; totalSessions: number; rows: ReportRow[] };
export type MyCourseAttendance = { course: Course; totalSessions: number; attended: number; percentage: number; belowThreshold: boolean; records: { sessionId: string; checkInTime: string }[] };
export type CheckInResult = AttendanceRecord & { courseCode?: string; courseName?: string };
export type ApiError = { error: { code: string; message: string } };
export const APP_NAME = 'CloudAttend';
export const QR_TOKEN_LIFETIME_SECONDS = 45;

/** A session past its scheduled end is closed even if nobody pressed "close". */
export function effectiveStatus(session: { status: string; scheduledEndTime: string }, nowMilliseconds: number): 'OPEN' | 'CLOSED' {
  return session.status === 'OPEN' && Date.parse(session.scheduledEndTime) > nowMilliseconds ? 'OPEN' : 'CLOSED';
}

export function attendancePercentage(attended: number, total: number) {
  return total === 0 ? 100 : Math.round((attended / total) * 1000) / 10;
}
