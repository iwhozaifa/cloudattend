import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { CircleAlertIcon, CircleCheckIcon } from 'lucide-react';
import { z } from 'zod';
import { EmailSchema, PasswordSchema, RollNoSchema } from '@cloudattend/shared';
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

const DetailsSchema = z.object({
  name: z.string().trim().min(2, 'Enter your full name.').max(100),
  rollNo: RollNoSchema,
  email: EmailSchema,
  password: PasswordSchema,
  confirmPassword: z.string()
}).refine((value) => value.password === value.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] });
export const CodeSchema = z.object({ code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email.') });
export const RESEND_COOLDOWN_SECONDS = 30;

export function useCooldown() {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (remaining <= 0) return;
    const timer = setTimeout(() => setRemaining((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [remaining]);
  return [remaining, () => setRemaining(RESEND_COOLDOWN_SECONDS)] as const;
}

export function SignUpPage() {
  const { adapter } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const state = (useLocation().state ?? {}) as AuthNotice;
  const carry = params.get('returnTo') ? `?returnTo=${encodeURIComponent(safeReturnTo(params.get('returnTo')))}` : '';
  const [email, setEmail] = useState(params.get('step') === 'confirm' ? state.email ?? '' : '');
  const [notice, setNotice] = useState(state.notice ?? '');
  const [error, setError] = useState('');
  const [cooldown, startCooldown] = useCooldown();
  const details = useForm<z.input<typeof DetailsSchema>>({ resolver: zodResolver(DetailsSchema), defaultValues: { name: '', rollNo: '', email: '', password: '', confirmPassword: '' }, mode: 'onTouched' });
  const confirm = useForm<z.input<typeof CodeSchema>>({ resolver: zodResolver(CodeSchema), defaultValues: { code: '' } });

  const register = details.handleSubmit(async (values) => {
    setError('');
    const input = DetailsSchema.parse(values);
    try {
      const next = await adapter.signUp({ email: input.email, password: input.password, name: input.name, rollNo: input.rollNo });
      if (next === 'DONE') {
        navigate(`/sign-in${carry}`, { state: { email: input.email, notice: 'Account created. Sign in to continue.' } satisfies AuthNotice });
        return;
      }
      setEmail(input.email);
      setNotice('');
      startCooldown();
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  });

  const verify = confirm.handleSubmit(async ({ code }) => {
    setError('');
    try {
      await adapter.confirmSignUp(email, code);
      navigate(`/sign-in${carry}`, { state: { email, notice: 'Email verified. Sign in to continue.' } satisfies AuthNotice });
    } catch (caught) {
      setError(authErrorMessage(caught));
      confirm.setValue('code', '');
      confirm.setFocus('code');
    }
  });

  async function resend() {
    setError('');
    try {
      await adapter.resendSignUpCode(email);
      setNotice(`We sent a new code to ${email}.`);
      startCooldown();
    } catch (caught) {
      setError(authErrorMessage(caught));
    }
  }

  if (email) {
    return (
      <AuthLayout title="Verify your email" description={<>Enter the 6-digit code we sent to <strong className="text-foreground">{email}</strong>.</>}>
        <form onSubmit={verify} noValidate>
          <FieldGroup>
            {notice && !error && <Alert><CircleCheckIcon /><AlertDescription>{notice}</AlertDescription></Alert>}
            {error && <Alert variant="destructive"><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
            <CodeField control={confirm.control} name="code" label="Verification code" />
            <Field>
              <Button type="submit" disabled={confirm.formState.isSubmitting}>
                {confirm.formState.isSubmitting && <Spinner />} Verify email
              </Button>
              <Button type="button" variant="outline" onClick={() => void resend()} disabled={cooldown > 0}>
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </Button>
              <FieldDescription className="text-center">
                Wrong email? <button type="button" className="underline underline-offset-4" onClick={() => { setEmail(''); setError(''); confirm.reset(); }}>Start again</button>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Create your student account" description="Register with your university email and roll number">
      <form onSubmit={register} noValidate>
        <FieldGroup>
          {error && <Alert variant="destructive"><CircleAlertIcon /><AlertDescription>{error}</AlertDescription></Alert>}
          <TextField control={details.control} name="name" label="Full name" autoComplete="name" autoFocus />
          <TextField control={details.control} name="rollNo" label="Roll number" autoComplete="off" placeholder="CS-2026-001" description="Must match your university record. It cannot be changed later." />
          <TextField control={details.control} name="email" label="Email" type="email" autoComplete="email" placeholder="you@university.edu" />
          <PasswordField control={details.control} name="password" label="Password" autoComplete="new-password" showRules />
          <PasswordField control={details.control} name="confirmPassword" label="Confirm password" autoComplete="new-password" />
          <Field>
            <Button type="submit" disabled={details.formState.isSubmitting}>
              {details.formState.isSubmitting && <Spinner />} Create account
            </Button>
            <FieldDescription className="text-center">
              Already have an account? <Link to={`/sign-in${carry}`}>Sign in</Link>
            </FieldDescription>
          </Field>
        </FieldGroup>
      </form>
    </AuthLayout>
  );
}
