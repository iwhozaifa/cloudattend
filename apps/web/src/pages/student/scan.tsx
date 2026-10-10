import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CameraOffIcon, KeyboardIcon } from 'lucide-react';
import { z } from 'zod';
import { CheckInFailure, CheckInSuccess } from '@/components/check-in/check-in-result';
import { QrScanner } from '@/components/check-in/qr-scanner';
import { TextField } from '@/components/form-fields';
import { PageHeader } from '@/components/page';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { extractToken } from '@/lib/qr';
import { useCheckIn } from '@/lib/queries';

const ManualSchema = z.object({ code: z.string().trim().refine((value) => Boolean(extractToken(value)), 'That is not a CloudAttend check-in code or link.') });

export function ScanPage() {
  const checkIn = useCheckIn();
  const [cameraError, setCameraError] = useState('');
  const [manual, setManual] = useState(false);
  const form = useForm<z.input<typeof ManualSchema>>({ resolver: zodResolver(ManualSchema), defaultValues: { code: '' } });

  function submit(token: string) {
    if (!checkIn.isPending && !checkIn.isSuccess) checkIn.mutate(token);
  }

  if (checkIn.isSuccess) return <><PageHeader title="Scan QR code" /><CheckInSuccess result={checkIn.data} onDone={() => checkIn.reset()} /></>;
  if (checkIn.isError) return <><PageHeader title="Scan QR code" /><CheckInFailure error={checkIn.error} onRetry={() => checkIn.reset()} /></>;

  return (
    <>
      <PageHeader title="Scan QR code" description="Point your camera at the code on your instructor's screen." />
      <div className="mx-auto grid w-full max-w-md gap-4">
        {!manual && !cameraError && (
          <Card className="overflow-hidden p-0">
            <QrScanner paused={checkIn.isPending} onToken={submit} onError={setCameraError} />
          </Card>
        )}
        {cameraError && !manual && (
          <Alert>
            <CameraOffIcon />
            <AlertTitle>Camera unavailable</AlertTitle>
            <AlertDescription>{cameraError}</AlertDescription>
          </Alert>
        )}
        {checkIn.isPending && <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground" role="status"><Spinner />Recording attendance…</p>}
        {manual ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Enter the code manually</CardTitle>
              <CardDescription>Paste the check-in link or code if scanning does not work.</CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-3" noValidate onSubmit={form.handleSubmit(({ code }) => submit(extractToken(code)!))}>
                <TextField control={form.control} name="code" label="Check-in code or link" autoComplete="off" />
                <div className="flex gap-2">
                  <Button type="submit" disabled={checkIn.isPending}>Check in</Button>
                  <Button type="button" variant="outline" onClick={() => { setManual(false); setCameraError(''); }}>Use camera</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Button variant="ghost" onClick={() => setManual(true)}><KeyboardIcon />Enter code manually</Button>
        )}
      </div>
    </>
  );
}
