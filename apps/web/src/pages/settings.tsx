import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTheme, type Theme } from '@/components/theme-provider';
import { toast } from 'sonner';
import { z } from 'zod';
import { PasswordSchema } from '@cloudattend/shared';
import { useAuth, useMe } from '@/auth/auth-context';
import { PasswordField } from '@/components/form-fields';
import { PageHeader } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { authErrorMessage } from '@/lib/auth/errors';

const ChangePasswordSchema = z.object({ oldPassword: z.string().min(1, 'Enter your current password.'), newPassword: PasswordSchema, confirmPassword: z.string() })
  .refine((value) => value.newPassword === value.confirmPassword, { message: 'Passwords do not match.', path: ['confirmPassword'] })
  .refine((value) => value.newPassword !== value.oldPassword, { message: 'Choose a password you have not just used.', path: ['newPassword'] });

export function SettingsPage() {
  const me = useMe();
  const { adapter } = useAuth();
  const { theme, setTheme } = useTheme();
  const form = useForm<z.input<typeof ChangePasswordSchema>>({ resolver: zodResolver(ChangePasswordSchema), defaultValues: { oldPassword: '', newPassword: '', confirmPassword: '' }, mode: 'onTouched' });
  const submit = form.handleSubmit(async ({ oldPassword, newPassword }) => {
    try {
      await adapter.changePassword(oldPassword, newPassword);
      toast.success('Password changed');
      form.reset();
    } catch (error) {
      const message = authErrorMessage(error);
      if (message === 'Incorrect email or password.') form.setError('oldPassword', { message: 'Your current password is incorrect.' });
      else toast.error(message);
    }
  });
  const details: [string, React.ReactNode][] = [
    ['Name', me.name], ['Email', me.email], ...(me.rollNo ? [['Roll number', me.rollNo] as [string, string]] : []),
    ['Role', <span className="flex gap-1" key="role"><Badge variant="secondary">{me.role === 'TEACHER' ? 'Teacher' : 'Student'}</Badge>{me.isAdmin && <Badge>Administrator</Badge>}</span>]
  ];
  return (
    <>
      <PageHeader title="Settings" description="Your profile, password, and appearance." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Profile</CardTitle><CardDescription>Contact your administrator to correct these details.</CardDescription></CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm">
              {details.map(([label, value]) => <div key={label} className="grid grid-cols-[8rem_1fr] gap-2"><dt className="text-muted-foreground">{label}</dt><dd className="break-all">{value}</dd></div>)}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Appearance</CardTitle></CardHeader>
          <CardContent>
            <Field>
              <FieldLabel htmlFor="theme">Theme</FieldLabel>
              <Select value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                <SelectTrigger id="theme" className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="system">System</SelectItem><SelectItem value="light">Light</SelectItem><SelectItem value="dark">Dark</SelectItem></SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Change password</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} noValidate className="max-w-md">
              <FieldGroup>
                <PasswordField control={form.control} name="oldPassword" label="Current password" />
                <PasswordField control={form.control} name="newPassword" label="New password" autoComplete="new-password" showRules />
                <PasswordField control={form.control} name="confirmPassword" label="Confirm new password" autoComplete="new-password" />
                <Button type="submit" className="w-fit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <Spinner />}Update password</Button>
              </FieldGroup>
            </form>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
