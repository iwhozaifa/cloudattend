import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { ArrowLeftIcon, MaximizeIcon, SquareIcon, UsersIcon } from 'lucide-react';
import { QR_TOKEN_LIFETIME_SECONDS } from '@cloudattend/shared';
import { formatDateTime, formatTime, PageHeader, PageSkeleton, QueryError } from '@/components/page';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { useAttendees, useCloseSession, useLiveSession, useQrToken } from '@/lib/queries';

/** Re-renders every second for countdowns. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

export function checkInUrl(token: string, origin = window.location.origin) {
  return `${origin}/check-in?token=${encodeURIComponent(token)}`;
}

function remaining(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, '0')}`;
}

export function LiveSessionPage() {
  const { sessionId = '' } = useParams();
  const session = useLiveSession(sessionId);
  const live = session.data?.status === 'OPEN';
  const qr = useQrToken(sessionId, live);
  const attendees = useAttendees(sessionId, live);
  const close = useCloseSession(sessionId, session.data?.courseId);
  const now = useNow(live);
  const qrCard = useRef<HTMLDivElement>(null);

  if (session.isPending) return <PageSkeleton />;
  if (session.isError) return <QueryError error={session.error} onRetry={() => void session.refetch()} title="Could not load this session" />;
  const { course } = session.data;
  const sessionSecondsLeft = (Date.parse(session.data.scheduledEndTime) - now) / 1000;
  const tokenSecondsLeft = qr.data ? qr.data.expiresAt - now / 1000 : 0;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="w-fit"><Link to={`/courses/${course.courseId}`}><ArrowLeftIcon />{course.courseCode}</Link></Button>
      <PageHeader
        eyebrow={live ? <Badge>Live</Badge> : <Badge variant="outline">Closed</Badge>}
        title={`${course.courseCode} attendance`}
        description={live ? `Started ${formatTime(session.data.startTime)} · closes automatically in ${remaining(sessionSecondsLeft)}` : `Held ${formatDateTime(session.data.startTime)}`}
        actions={live && (
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive"><SquareIcon />Close session</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close attendance now?</AlertDialogTitle>
                <AlertDialogDescription>Students will no longer be able to check in for this session.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep open</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => close.mutate(undefined, {
                  onSuccess: () => toast.success('Attendance closed'),
                  onError: (error) => toast.error(errorMessage(error))
                })}>Close session</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      />
      <div className={live ? 'grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]' : 'grid gap-6'}>
        {live && (
          <Card ref={qrCard} className="items-center bg-card [&:fullscreen]:justify-center">
            <CardHeader className="w-full text-center">
              <CardTitle>Scan to check in</CardTitle>
              <CardDescription>Open CloudAttend → Scan QR code, or point your phone camera at the code.</CardDescription>
            </CardHeader>
            <CardContent className="flex w-full flex-col items-center gap-4">
              {qr.isError ? <QueryError error={qr.error} onRetry={() => void qr.refetch()} title="Could not load the QR code" /> : qr.data ? (
                <div className="rounded-xl bg-white p-4" data-testid="qr-code" data-token={qr.data.token}>
                  <QRCodeSVG value={checkInUrl(qr.data.token)} size={320} level="M" className="h-auto w-full max-w-[min(70vh,320px)]" title="Attendance QR code" />
                </div>
              ) : <Skeleton className="size-80 max-w-full" />}
              <div className="w-full max-w-xs space-y-1" aria-live="off">
                <Progress value={Math.max(0, Math.min(100, (tokenSecondsLeft / QR_TOKEN_LIFETIME_SECONDS) * 100))} aria-label="Time until this code expires" />
                <p className="text-center text-xs text-muted-foreground">The code refreshes automatically every ~35 seconds.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void qrCard.current?.requestFullscreen?.()}><MaximizeIcon />Full screen</Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><UsersIcon className="size-4" />Checked in <Badge variant="secondary" className="tabular-nums" data-testid="present-count">{attendees.data?.length ?? 0}</Badge></CardTitle>
            {live && <CardDescription>Updates every few seconds.</CardDescription>}
          </CardHeader>
          <CardContent>
            {attendees.isPending ? <Skeleton className="h-24" /> : attendees.isError ? <QueryError error={attendees.error} /> : attendees.data.length === 0 ? (
              <Empty><EmptyHeader><EmptyTitle>No check-ins yet</EmptyTitle><EmptyDescription>{live ? 'Names appear here as students scan.' : 'Nobody checked in to this session.'}</EmptyDescription></EmptyHeader></Empty>
            ) : (
              <ul className="divide-y" aria-label="Checked-in students">
                {attendees.data.map((attendee) => (
                  <li key={attendee.studentId} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{attendee.name ?? 'Unknown student'}</span><span className="text-xs text-muted-foreground">{attendee.rollNo}</span></span>
                    <time className="shrink-0 text-xs text-muted-foreground tabular-nums" dateTime={attendee.checkInTime}>{formatTime(attendee.checkInTime)}</time>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
