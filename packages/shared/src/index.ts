import { z } from 'zod';

export const roles = ['STUDENT', 'TEACHER'] as const;
export const RoleSchema = z.enum(roles);
export type Role = z.infer<typeof RoleSchema>;
export const SessionStatusSchema = z.enum(['OPEN', 'CLOSED']);
export const AttendanceStatusSchema = z.literal('PRESENT');

export const CreateCourseSchema = z.object({
  courseCode: z.string().trim().min(2).max(20).transform((v) => v.toUpperCase()),
  courseName: z.string().trim().min(2).max(120),
  semester: z.string().trim().min(2).max(50),
  section: z.string().trim().min(1).max(20),
  attendanceThreshold: z.number().int().min(1).max(100).default(75)
}).strict();
export const UpdateCourseSchema = CreateCourseSchema.partial();
export const EnrollStudentSchema = z.object({ studentId: z.string().uuid() }).strict();
export const StartSessionSchema = z.object({ durationMinutes: z.number().int().min(1).max(180).default(10) }).strict();
export const CheckInSchema = z.object({ token: z.string().min(20).max(4096) }).strict();
export const RegisterSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  rollNo: z.string().trim().min(2).max(64),
  password: z.string().min(12).max(128)
}).strict();

export type User = { userId: string; email: string; name: string; rollNo?: string; role: Role; createdAt: string; updatedAt: string };
export type Course = z.infer<typeof CreateCourseSchema> & { courseId: string; teacherId: string; createdAt: string; updatedAt: string };
export type AttendanceSession = { sessionId: string; courseId: string; teacherId: string; startTime: string; scheduledEndTime: string; actualEndTime?: string; status: 'OPEN' | 'CLOSED'; tokenLifetimeSeconds: number; createdAt: string };
export type ApiError = { error: { code: string; message: string } };
export const APP_NAME = 'CloudAttend';
export const QR_TOKEN_LIFETIME_SECONDS = 45;
