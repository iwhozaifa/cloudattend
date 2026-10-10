import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireAuth, RequireRole } from '@/auth/guards';
import { AppShell } from '@/components/layout/app-shell';
import { ForgotPasswordPage } from '@/pages/auth/forgot-password';
import { SignInPage } from '@/pages/auth/sign-in';
import { SignUpPage } from '@/pages/auth/sign-up';
import { DashboardPage } from '@/pages/dashboard';
import { NotFoundPage } from '@/pages/not-found';

const named = <K extends string>(loader: () => Promise<Record<K, React.ComponentType>>, name: K) => lazy(async () => ({ default: (await loader())[name] }));
const CourseDetailPage = named(() => import('@/pages/teacher/course-detail'), 'CourseDetailPage');
const LiveSessionPage = named(() => import('@/pages/teacher/live-session'), 'LiveSessionPage');
const ScanPage = named(() => import('@/pages/student/scan'), 'ScanPage');
const CheckInPage = named(() => import('@/pages/student/check-in'), 'CheckInPage');
const MyAttendancePage = named(() => import('@/pages/student/my-attendance'), 'MyAttendancePage');
const AdminUsersPage = named(() => import('@/pages/admin/users'), 'AdminUsersPage');
const SettingsPage = named(() => import('@/pages/settings'), 'SettingsPage');

export function App() {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/sign-in" element={<SignInPage />} />
        <Route path="/sign-up" element={<SignUpPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      </Route>
      <Route path="/login" element={<Navigate to="/sign-in" replace />} />
      <Route path="/register" element={<Navigate to="/sign-up" replace />} />
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route index element={<DashboardPage />} />
        <Route element={<RequireRole role="TEACHER" />}>
          <Route path="/courses/:courseId" element={<CourseDetailPage />} />
          <Route path="/sessions/:sessionId/live" element={<LiveSessionPage />} />
        </Route>
        <Route element={<RequireRole role="STUDENT" />}>
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/check-in" element={<CheckInPage />} />
          <Route path="/attendance" element={<MyAttendancePage />} />
        </Route>
        <Route element={<RequireRole admin />}>
          <Route path="/admin/users" element={<AdminUsersPage />} />
        </Route>
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
