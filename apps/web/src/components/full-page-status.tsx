import type { ReactNode } from 'react';
import { Spinner } from '@/components/ui/spinner';

export function FullPageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-svh items-center justify-center gap-3 text-muted-foreground" role="status" aria-live="polite">
      <Spinner className="size-5" />
      <span>{label}</span>
    </div>
  );
}

export function CenteredPanel({ children }: { children: ReactNode }) {
  return <div className="flex min-h-svh items-center justify-center p-6">{children}</div>;
}
