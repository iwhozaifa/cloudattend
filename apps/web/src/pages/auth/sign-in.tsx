import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleCheckIcon, CircleAlertIcon } from 'lucide-react';
import { z } from 'zod';
import { EmailSchema, PasswordSchema } from '@cloudattend/shared';
import { useAuth } from '@/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { PasswordField, TextField } from '@/components/form-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { authErrorMessage } from '@/lib/auth/errors';
import type { SignInNext } from '@/lib/auth/types';
import { safeReturnTo } from '@/lib/return-to';

const SignInSchema = z.object({ email: EmailSchema, password: z.string().min(1, 'Enter your password.') });
const NewPasswordSchema = z.object({ password: PasswordSchema, confirmPassword: z.string() })
  .refine((value) => value.password === value.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });

export type AuthNotice = { email?: string; notice?: string };

export function SignInPage() {
  const { adapter, refresh } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state = (useLocation().state ?? {}) as AuthNotice;
  const returnTo = safeReturnTo(params.get('returnTo'));
  const carry = params.get('returnTo') ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
  const [error, setError] = useState('');
  const [challenge, setChallenge] = useState(false);
  const form = useForm<z.input<typeof SignInSchema>>({ resolver: zodResolver(SignInSchema), defaultValues: { email: state.email ?? '', password: '' } });
  const newPassword = useForm<z.input<typeof NewPasswordSchema>>({ resolver: zodResolver(NewPasswordSchema), defaultValues: { password: '', confirmPassword: '' }, mode: 'onTouched' });

  async function follow(next: SignInNext, email: string) {
    switch (next) {
      case 'DONE':
        await refresh();
        navigate(returnTo, { replace: true });
        return;
      case 'NEW_PASSWORD_REQUIRED':
        setChallenge(true);
        return;
      case 'CONFIRM_SIGN_UP':
        await adapter.resendSignUpCode(email).catch(() => undefined);
        navigate(`/sign-up${carry ? `${carry}&` : '?'}step=confirm`, { state: { email, notice: 'Your email is not verified yet. We sent you a new code.' } satisfies AuthNotice });
        return;
      case 'RESET_PASSWORD':
        await adapter.forgotPassword(email).catch(() => undefined);
        navigate(`/forgot-password${carry}`, { state: { email, notice: 'You need to set a new password. We emailed you a reset code.' } satisfies AuthNotice });
    }
  }

  const submit = form.handleSubmit(async ({ email, password }) => {
    setError('');
    try {
      await follow(await adapter.signIn(email, password), email);
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  });
  const submitNewPassword = newPassword.handleSubmit(async ({ password }) => {
    setError('');
    try {
      await follow(await adapter.confirmNewPassword(password), form.getValues('email'));
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  });

  if (challenge) {
    return (
      <AuthLayout title="Set a new password" description="Your account was created by an administrator. Choose a password to finish signing in.">
        <form onSubmit={submitNewPassword} noValidate>
          <FieldGroup>
            {error && <Alert variant="destructive"><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
            <PasswordField control={newPassword.control} name="password" label="New password" autoComplete="new-password" showRules />
            <PasswordField control={newPassword.control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
            <Button type="submit" disabled={newPassword.formState.isSubmitting}>
              {newPassword.formState.isSubmitting && <Spinner />} Set password and continue
            </Button>
          </FieldGroup>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Welcome back" description="Sign in with your university email" footer="Teachers are invited by an administrator after registering.">
      <form onSubmit={submit} noValidate>
        <FieldGroup>
          {state.notice && !error && <Alert><CircleCheckIcon /><AlertDescription>{state.notice}</AlertDescription></Alert>}
          {error && <Alert variant="destructive"><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" placeholder="you@university.edu" autoFocus />
          <PasswordField control={form.control} name="password" label="Password"
            labelAction={<Link to={`/forgot-password${carry}`} state={{ email: form.watch('email') } satisfies AuthNotice} className="underline-offset-4 hover:underline">Forgot your password?</Link>} />
          <Field>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting && <Spinner />} Sign in
            </Button>
            <FieldDescription className="text-center">
              Don&apos;t have an account? <Link to={`/sign-up${carry}`}>Sign up</Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
