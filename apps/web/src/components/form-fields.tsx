import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from 'lucide-react';
import { passwordRules } from '@cloudattend/shared';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { cn } from '@/lib/utils';

type BaseProps<T extends FieldValues> = { control: Control<T>; name: Path<T>; label: string; description?: ReactNode; labelAction?: ReactNode };

/** A labelled shadcn input bound to react-hook-form, with accessible error text. */
export function TextField<T extends FieldValues>({ control, name, label, description, labelAction, ...inputProps }: BaseProps<T> & Omit<ComponentProps<typeof Input>, 'name'>) {
  const id = useId();
  return (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <div className="flex items-center">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {labelAction && <span className="ml-auto text-sm">{labelAction}</span>}
        </div>
        <Input {...inputProps} {...field} value={field.value ?? ''} id={id} aria-invalid={fieldState.invalid} aria-describedby={fieldState.invalid ? `${id}-error` : undefined} />
        {description && <FieldDescription>{description}</FieldDescription>}
        {fieldState.invalid && <FieldError id={`${id}-error`} errors={[fieldState.error]} />}
      </Field>
    )} />
  );
}

export function PasswordChecklist({ value }: { value: string }) {
  return (
    <ul className="grid gap-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
      {passwordRules.map((rule) => {
        const met = rule.test(value);
        return (
          <li key={rule.id} className={cn('flex items-center gap-1.5', met ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
            {met ? <CheckIcon className="size-3.5" aria-hidden /> : <XIcon className="size-3.5" aria-hidden />}
            <span>{rule.label}<span className="sr-only">{met ? ' (met)' : ' (not met)'}</span></span>
          </li>
        );
      })}
    </ul>
  );
}

/** Password input with a show/hide toggle and, for new passwords, the Cognito policy checklist. */
export function PasswordField<T extends FieldValues>({ control, name, label, labelAction, showRules, autoComplete = 'current-password' }: BaseProps<T> & { showRules?: boolean; autoComplete?: string }) {
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <div className="flex items-center">
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          {labelAction && <span className="ml-auto text-sm">{labelAction}</span>}
        </div>
        <div className="relative">
          <Input {...field} value={field.value ?? ''} id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} className="pr-10" aria-invalid={fieldState.invalid} aria-describedby={fieldState.invalid ? `${id}-error` : undefined} />
          <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 right-0.5 size-8 -translate-y-1/2" onClick={() => setVisible((current) => !current)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={visible}>
            {visible ? <EyeOffIcon /> : <EyeIcon />}
          </Button>
        </div>
        {showRules && <PasswordChecklist value={String(field.value ?? '')} />}
        {fieldState.invalid && !showRules && <FieldError id={`${id}-error`} errors={[fieldState.error]} />}
        {fieldState.invalid && showRules && fieldState.error?.type !== 'custom' && <FieldError id={`${id}-error`} errors={[fieldState.error]} />}
        {fieldState.invalid && showRules && fieldState.error?.type === 'custom' && <FieldError id={`${id}-error`}>Choose a password that meets every requirement.</FieldError>}
      </Field>
    )} />
  );
}

/** Six-digit verification code using the shadcn InputOTP component. */
export function CodeField<T extends FieldValues>({ control, name, label, description }: BaseProps<T>) {
  const id = useId();
  return (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <Field data-invalid={fieldState.invalid}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <InputOTP ref={field.ref} id={id} maxLength={6} pattern="^[0-9]*$" inputMode="numeric" autoComplete="one-time-code" value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} aria-invalid={fieldState.invalid} containerClassName="justify-center">
          <InputOTPGroup>
            {Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} aria-invalid={fieldState.invalid} />)}
          </InputOTPGroup>
        </InputOTP>
        {description && <FieldDescription className="text-center">{description}</FieldDescription>}
        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
      </Field>
    )} />
  );
}
