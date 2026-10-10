import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AppLogo } from '@/components/app-logo';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Page frame from the shadcn `login-03` block: muted background, centred logo and card. */
export function AuthLayout({ title, description, children, footer }: { title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <Link to="/" className="self-center" aria-label="CloudAttend home"><AppLogo /></Link>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl"><h1>{title}</h1></CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer && <div className="px-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </main>
  );
}
