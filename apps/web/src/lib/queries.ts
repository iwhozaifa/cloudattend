import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttendanceSession,
  CheckInResult,
  Course,
  CourseReport,
  MyCourseAttendance,
  QrToken,
  Role,
  RosterEntry,
  SessionAttendee,
  SessionSummary,
  StudentCourse,
  User
} from '@cloudattend/shared';
import { api } from './api';

export const keys = {
  courses: ['courses'] as const,
  course: (courseId: string) => ['courses', courseId] as const,
  roster: (courseId: string) => ['courses', courseId, 'roster'] as const,
  sessions: (courseId: string) => ['courses', courseId, 'sessions'] as const,
  report: (courseId: string) => ['courses', courseId, 'report'] as const,
  session: (sessionId: string) => ['sessions', sessionId] as const,
  attendees: (sessionId: string) => ['sessions', sessionId, 'attendance'] as const,
  qr: (sessionId: string) => ['sessions', sessionId, 'qr'] as const,
  myAttendance: ['me', 'attendance'] as const,
  adminUsers: ['admin', 'users'] as const
};

export type CourseInput = { courseCode: string; courseName: string; semester: string; section: string; attendanceThreshold: number };
export type LiveSession = AttendanceSession & { course: Course };

export const useCourses = <T extends Course | StudentCourse = Course>() => useQuery({ queryKey: keys.courses, queryFn: () => api<T[]>('/courses') });
export const useCourse = (courseId: string) => useQuery({ queryKey: keys.course(courseId), queryFn: () => api<Course>(`/courses/${courseId}`) });
export const useRoster = (courseId: string) => useQuery({ queryKey: keys.roster(courseId), queryFn: () => api<RosterEntry[]>(`/courses/${courseId}/students`) });
export const useSessions = (courseId: string) => useQuery({ queryKey: keys.sessions(courseId), queryFn: () => api<SessionSummary[]>(`/courses/${courseId}/sessions`) });
export const useReport = (courseId: string) => useQuery({ queryKey: keys.report(courseId), queryFn: () => api<CourseReport>(`/courses/${courseId}/report`) });
export const useMyAttendance = (enabled = true) => useQuery({ queryKey: keys.myAttendance, queryFn: () => api<MyCourseAttendance[]>('/me/attendance'), enabled });
export const useAdminUsers = () => useQuery({ queryKey: keys.adminUsers, queryFn: () => api<User[]>('/admin/users') });

export function useLiveSession(sessionId: string) {
  return useQuery({
    queryKey: keys.session(sessionId),
    queryFn: () => api<LiveSession>(`/sessions/${sessionId}`),
    // Re-check status so a session that reaches its scheduled end flips to closed on screen.
    refetchInterval: (query) => query.state.data?.status === 'OPEN' ? 15_000 : false
  });
}

export function useAttendees(sessionId: string, live: boolean) {
  return useQuery({ queryKey: keys.attendees(sessionId), queryFn: () => api<SessionAttendee[]>(`/sessions/${sessionId}/attendance`), refetchInterval: live ? 4_000 : false });
}

/** Seconds before a QR token's expiry at which the next one is fetched. */
export const QR_REFRESH_MARGIN_SECONDS = 10;

/** Fetches a fresh signed token shortly before the current one expires (tokens live 45 s). */
export function useQrToken(sessionId: string, enabled: boolean) {
  return useQuery({
    queryKey: keys.qr(sessionId),
    queryFn: () => api<QrToken>(`/sessions/${sessionId}/qr-token`),
    enabled,
    gcTime: 0,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      const token = query.state.data;
      if (!token) return false;
      return Math.max(1_000, (token.expiresAt - QR_REFRESH_MARGIN_SECONDS) * 1000 - Date.now());
    }
  });
}

export function useCreateCourse() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: CourseInput) => api<Course>('/courses', { method: 'POST', body: input }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.courses })
  });
}

export function useUpdateCourse(courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<CourseInput>) => api<Course>(`/courses/${courseId}`, { method: 'PUT', body: input }),
    onSuccess: (course) => {
      client.setQueryData(keys.course(courseId), course);
      void client.invalidateQueries({ queryKey: keys.courses });
    }
  });
}

export function useDeleteCourse(courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api(`/courses/${courseId}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: keys.course(courseId) });
      void client.invalidateQueries({ queryKey: keys.courses });
    }
  });
}

export function useEnroll(courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string } | { rollNo: string }) => api<RosterEntry>(`/courses/${courseId}/students`, { method: 'POST', body }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.roster(courseId) });
      void client.invalidateQueries({ queryKey: keys.report(courseId) });
    }
  });
}

export function useUnenroll(courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (studentId: string) => api(`/courses/${courseId}/students/${studentId}`, { method: 'DELETE' }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.roster(courseId) });
      void client.invalidateQueries({ queryKey: keys.report(courseId) });
    }
  });
}

export function useStartSession(courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (durationMinutes: number) => api<AttendanceSession>(`/courses/${courseId}/sessions`, { method: 'POST', body: { durationMinutes } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.sessions(courseId) })
  });
}

export function useCloseSession(sessionId: string, courseId?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api<AttendanceSession>(`/sessions/${sessionId}/close`, { method: 'POST' }),
    onSettled: () => {
      void client.invalidateQueries({ queryKey: keys.session(sessionId) });
      if (courseId) {
        void client.invalidateQueries({ queryKey: keys.sessions(courseId) });
        void client.invalidateQueries({ queryKey: keys.report(courseId) });
      }
    }
  });
}

export function useCheckIn() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (token: string) => api<CheckInResult>('/attendance/check-in', { method: 'POST', body: { token } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.myAttendance })
  });
}

export function useSetRole() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) => api<User>(`/admin/users/${userId}/role`, { method: 'POST', body: { role } }),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.adminUsers })
  });
}
