import type { ReactNode } from 'react';
import { Link, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom';
import { ShieldAlertIcon } from 'lucide-react';
import type { Role } from '@cloudattend/shared';
import { CenteredPanel, FullPageSpinner } from '@/components/full-page-status';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { errorMessage } from '@/lib/api';
import { safeReturnTo } from '@/lib/return-to';
import { useAuth } from './auth-context';

/** Renders children only for a signed-in user; otherwise sends them to sign in and back. */
export function RequireAuth({ children }: { children?: ReactNode }) {
  const { status, error, refresh, signOut, signedOutByUser } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'signedOut') {
    // After an explicit sign-out (e.g. on a shared lab computer) the next person starts fresh.
    if (signedOutByUser) return <Navigate to="/sign-in" replace />;
    return <Navigate to={`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  if (status === 'error') {
    return (
      <CenteredPanel>
        <Alert variant="destructive" className="max-w-md">
          <ShieldAlertIcon />
          <AlertTitle>We could not load your account</AlertTitle>
          <AlertDescription>
            <p>{errorMessage(error)}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void refresh()}>Try again</Button>
              <Button size="sm" variant="outline" onClick={() => void signOut()}>Sign out</Button>
            </div>
          </AlertDescription>
        </Alert>
      </CenteredPanel>
    );
  }
  return children ?? <Outlet />;
}

/** Restricts a route to a role and/or administrators. */
export function RequireRole({ role, admin, children }: { role?: Role; admin?: boolean; children?: ReactNode }) {
  const { me } = useAuth();
  const allowed = me && (!role || me.role === role) && (!admin || me.isAdmin);
  if (!allowed) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><ShieldAlertIcon /></EmptyMedia>
          <EmptyTitle>You don&apos;t have access to this page</EmptyTitle>
          <EmptyDescription>This area is for {admin ? 'administrators' : role === 'TEACHER' ? 'teachers' : 'students'}.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button asChild variant="outline"><Link to="/">Back to dashboard</Link></Button></EmptyContent>
      </Empty>
    );
  }
  return children ?? <Outlet />;
}

/** Sign-in/up pages: a signed-in visitor goes straight to where they were heading. */
export function PublicOnly({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const [params] = useSearchParams();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'signedIn') return <Navigate to={safeReturnTo(params.get('returnTo'))} replace />;
  return children ?? <Outlet />;
}
