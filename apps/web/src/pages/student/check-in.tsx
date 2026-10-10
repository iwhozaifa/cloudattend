import { useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { CheckInFailure, CheckInSuccess } from '@/components/check-in/check-in-result';
import { PageHeader } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { extractToken } from '@/lib/qr';
import { useCheckIn } from '@/lib/queries';

/**
 * Landing page for phone-camera scans of the QR link. The token is removed from the address bar
 * immediately and submitted exactly once (StrictMode double effects included).
 */
export function CheckInPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const checkIn = useCheckIn();
  const token = useRef<string | undefined>(undefined);
  const submitted = useRef(false);
  if (token.current === undefined) token.current = extractToken(new URLSearchParams(location.search).get('token') ?? '') ?? '';

  useEffect(() => {
    if (location.search) navigate(location.pathname, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    if (!token.current || submitted.current) return;
    submitted.current = true;
    checkIn.mutate(token.current);
  }, [checkIn]);

  let body;
  if (!token.current) {
    body = (
      <Empty className="border">
        <EmptyHeader><EmptyTitle>No check-in code</EmptyTitle><EmptyDescription>Scan the QR code your instructor is showing.</EmptyDescription></EmptyHeader>
        <EmptyContent><Button asChild><Link to="/scan">Open scanner</Link></Button></EmptyContent>
      </Empty>
    );
  } else if (checkIn.isSuccess) {
    body = <CheckInSuccess result={checkIn.data} />;
  } else if (checkIn.isError) {
    body = <CheckInFailure error={checkIn.error} onRetry={() => navigate('/scan')} />;
  } else {
    body = <p className="flex items-center justify-center gap-2 py-12 text-muted-foreground" role="status"><Spinner />Recording attendance…</p>;
  }
  return <><PageHeader title="Check in" />{body}</>;
}
