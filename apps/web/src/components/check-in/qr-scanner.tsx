import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const Scanner = lazy(() => import('./qr-scanner-impl'));

/** Camera QR scanner (lazy-loaded so the decoder only downloads on the scan page). */
export function QrScanner(props: { paused: boolean; onToken: (token: string) => void; onError: (message: string) => void }) {
  return (
    <Suspense fallback={<Skeleton className="aspect-square w-full" />}>
      <Scanner {...props} />
    </Suspense>
  );
}
