import { Link } from 'react-router-dom';
import { CircleCheckBigIcon, CircleXIcon } from 'lucide-react';
import type { CheckInResult as Result } from '@cloudattend/shared';
import { formatTime } from '@/components/page';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError, errorMessage } from '@/lib/api';

export function CheckInSuccess({ result, onDone }: { result: Result; onDone?: () => void }) {
  return (
    <Card className="mx-auto w-full max-w-md text-center" role="status">
      <CardHeader className="items-center">
        <CircleCheckBigIcon className="mx-auto size-12 text-emerald-600 dark:text-emerald-400" aria-hidden />
        <CardTitle className="text-xl">Attendance recorded</CardTitle>
        <CardDescription>{result.courseCode} · {result.courseName}</CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">Checked in at {formatTime(result.checkInTime)}.</CardContent>
      <CardFooter className="flex justify-center gap-2">
        <Button asChild variant="outline"><Link to="/attendance">View my attendance</Link></Button>
        {onDone && <Button onClick={onDone}>Done</Button>}
      </CardFooter>
    </Card>
  );
}

export function CheckInFailure({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const already = error instanceof ApiError && error.code === 'ATTENDANCE_ALREADY_RECORDED';
  return (
    <Card className="mx-auto w-full max-w-md text-center" role="alert">
      <CardHeader className="items-center">
        {already
          ? <CircleCheckBigIcon className="mx-auto size-12 text-emerald-600 dark:text-emerald-400" aria-hidden />
          : <CircleXIcon className="mx-auto size-12 text-destructive" aria-hidden />}
        <CardTitle className="text-xl">{already ? 'Already checked in' : 'Check-in failed'}</CardTitle>
        <CardDescription>{errorMessage(error)}</CardDescription>
      </CardHeader>
      <CardFooter className="flex justify-center gap-2">
        <Button asChild variant="outline"><Link to="/attendance">My attendance</Link></Button>
        {!already && <Button onClick={onRetry}>Scan again</Button>}
      </CardFooter>
    </Card>
  );
}
