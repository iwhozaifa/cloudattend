import { Navigate, Route, Routes } from 'react-router-dom';
import { PublicOnly, RequireAuth } from '@/auth/guards';
import { ForgotPasswordPage } from '@/pages/auth/forgot-password';
import { SignInPage } from '@/pages/auth/sign-in';
import { SignUpPage } from '@/pages/auth/sign-up';
import { LegacyCheckIn, LegacyCourse, LegacyDashboard } from '@/pages/legacy';

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
      <Route element={<RequireAuth />}>
        <Route path="/" element={<LegacyDashboard />} />
        <Route path="/courses/:courseId" element={<LegacyCourse />} />
        <Route path="/check-in" element={<LegacyCheckIn />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
