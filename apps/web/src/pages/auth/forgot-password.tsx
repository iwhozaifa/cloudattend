import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { z } from 'zod';
import { EmailSchema, PasswordSchema } from '@cloudattend/shared';
import { useAuth } from '@/auth/auth-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { CodeField, PasswordField, TextField } from '@/components/form-fields';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { authErrorMessage } from '@/lib/auth/errors';
import { safeReturnTo } from '@/lib/return-to';
import type { AuthNotice } from './sign-in';
import { useCooldown } from './sign-up';

const RequestSchema = z.object({ email: EmailSchema });
const ResetSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.'),
  password: PasswordSchema,
  confirmPassword: z.string()
}).refine((value) => value.password === value.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });

export function ForgotPasswordPage() {
  const { adapter } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state = (useLocation().state ?? {}) as AuthNotice;
  const carry = params.get('returnTo') ? `?returnTo=${encodeURIComponent(safeReturnTo(params.get('returnTo')))}` : '';
  // Arriving from a RESET_PASSWORD sign-in step, the code has already been sent.
  const [email, setEmail] = useState(state.notice && state.email ? state.email : '');
  const [notice, setNotice] = useState(state.notice ?? '');
  const [error, setError] = useState('');
  const [cooldown, startCooldown] = useCooldown();
  const request = useForm<z.input<typeof RequestSchema>>({ resolver: zodResolver(RequestSchema), defaultValues: { email: state.email ?? '' } });
  const reset = useForm<z.input<typeof ResetSchema>>({ resolver: zodResolver(ResetSchema), defaultValues: { code: '', password: '', confirmPassword: '' }, mode: 'onTouched' });

  async function send(address: string) {
    setError('');
    try {
      await adapter.forgotPassword(address);
      setEmail(address);
      // Cognito does not reveal whether the account exists, and neither do we.
      setNotice(`If an account exists for ${address}, we sent it a 6-digit reset code.`);
      startCooldown();
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  }

  const submitRequest = request.handleSubmit(async (values) => send(RequestSchema.parse(values).email));
  const submitReset = reset.handleSubmit(async ({ code, password }) => {
    setError('');
    try {
      await adapter.confirmForgotPassword(email, code, password);
      navigate(`/sign-in${carry}`, { state: { email, notice: 'Password updated. Sign in with your new password.' } satisfies AuthNotice });
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  });

  if (email) {
    return (
      <AuthLayout title="Choose a new password" description={<>Enter the code sent to <strong className="text-foreground">{email}</strong> and your new password.</>}>
        <form onSubmit={submitReset} noValidate>
          <FieldGroup>
            {notice && !error && <Alert><CircleCheckIcon /><AlertDescription>{notice}</AlertDescription></Alert>}
            {error && <Alert variant="destructive"><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
            <CodeField control={reset.control} name="code" label="Reset code" />
            <PasswordField control={reset.control} name="password" label="New password" autoComplete="new-password" showRules />
            <PasswordField control={reset.control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
            <Field>
              <Button type="submit" disabled={reset.formState.isSubmitting}>
                {reset.formState.isSubmitting && <Spinner />} Reset password
              </Button>
              <Button type="button" variant="outline" disabled={cooldown > 0} onClick={() => void send(email)}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Button>
              <FieldDescription className="text-center">
                <button type="button" className="underline underline-offset-4" onClick={() => { setEmail(''); setNotice(''); setError(''); reset.reset(); }}>Use a different email</button>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" description="We'll email you a code to set a new password">
      <form onSubmit={submitRequest} noValidate>
        <FieldGroup>
          {error && <Alert variant="destructive"><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          <TextField control={request.control} name="email" label="Email" type="email" autoComplete="email" placeholder="you@university.edu" autoFocus />
          <Field>
            <Button type="submit" disabled={request.formState.isSubmitting}>
              {request.formState.isSubmitting && <Spinner />} Send reset code
            </Button>
            <FieldDescription className="text-center">
              Remembered it? <Link to={`/sign-in${carry}`}>Back to sign in</Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
