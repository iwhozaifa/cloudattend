import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import { ArrowLeftIcon, DownloadIcon, PencilIcon, PlayIcon, RadioIcon, Trash2Icon, UserMinusIcon, UserPlusIcon } from 'lucide-react';
import { EmailSchema } from '@cloudattend/shared';
import { CourseFormDialog } from '@/components/courses/course-form-dialog';
import { TextField } from '@/components/form-fields';
import { formatDateTime, PageHeader, PageSkeleton, QueryError } from '@/components/page';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiBlob, errorMessage } from '@/lib/api';
import { useCourse, useDeleteCourse, useEnroll, useReport, useRoster, useSessions, useStartSession, useUnenroll, useUpdateCourse } from '@/lib/queries';

const TABS = ['sessions', 'roster', 'report'] as const;

export function CourseDetailPage() {
  const { courseId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((value) => value === params.get('tab')) ?? 'sessions';
  const course = useCourse(courseId);
  const sessions = useSessions(courseId);
  const update = useUpdateCourse(courseId);
  const openSession = sessions.data?.find((session) => session.status === 'OPEN');

  if (course.isPending) return <PageSkeleton />;
  if (course.isError) return <QueryError error={course.error} onRetry={() => void course.refetch()} title="Could not load this course" />;
  const data = course.data;

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="w-fit"><Link to="/"><ArrowLeftIcon />All courses</Link></Button>
      <PageHeader
        eyebrow={<Badge variant="secondary">{data.courseCode}</Badge>}
        title={data.courseName}
        description={`${data.semester} · Section ${data.section} · Threshold ${data.attendanceThreshold}%`}
        actions={<>
          {openSession
            ? <Button asChild><Link to={`/sessions/${openSession.sessionId}/live`}><RadioIcon />Resume live session</Link></Button>
            : <StartSessionDialog courseId={courseId} />}
          <CourseFormDialog course={data} title="Edit course" submitLabel="Save changes"
            trigger={<Button variant="outline"><PencilIcon />Edit</Button>}
            onSubmit={async (input) => { await update.mutateAsync(input); toast.success('Course updated'); }} />
          <DeleteCourseButton courseId={courseId} courseCode={data.courseCode} />
        </>}
      />
      <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="sessions">Sessions</TabsTrigger>
          <TabsTrigger value="roster">Roster</TabsTrigger>
          <TabsTrigger value="report">Report</TabsTrigger>
        </TabsList>
        <TabsContent value="sessions" className="mt-4"><SessionsTab courseId={courseId} /></TabsContent>
        <TabsContent value="roster" className="mt-4"><RosterTab courseId={courseId} /></TabsContent>
        <TabsContent value="report" className="mt-4"><ReportTab courseId={courseId} courseCode={data.courseCode} /></TabsContent>
      </Tabs>
    </>
  );
}

const DURATIONS = [5, 10, 15, 30, 60, 90];

function StartSessionDialog({ courseId }: { courseId: string }) {
  const navigate = useNavigate();
  const start = useStartSession(courseId);
  const [duration, setDuration] = useState('10');
  return (
    <Dialog>
      <DialogTrigger asChild><Button><PlayIcon />Start attendance</Button></DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Start an attendance session</DialogTitle>
          <DialogDescription>A rotating QR code is shown for students to scan. Each code is valid for 45 seconds.</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor="duration">Session length</FieldLabel>
          <Select value={duration} onValueChange={setDuration}>
            <SelectTrigger id="duration" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{DURATIONS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes} minutes</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button disabled={start.isPending} onClick={() => start.mutate(Number(duration), {
            onSuccess: (session) => navigate(`/sessions/${session.sessionId}/live`),
            onError: (error) => toast.error(errorMessage(error))
          })}>
            {start.isPending && <Spinner />}Start and show QR code
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteCourseButton({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  const navigate = useNavigate();
  const remove = useDeleteCourse(courseId);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline" aria-label="Delete course"><Trash2Icon /></Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {courseCode}?</AlertDialogTitle>
          <AlertDialogDescription>The course and its roster are removed. Recorded attendance is kept for audit. This cannot be undone.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => remove.mutate(undefined, {
            onSuccess: () => { toast.success(`${courseCode} deleted`); navigate('/'); },
            onError: (error) => toast.error(errorMessage(error))
          })}>Delete course</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SessionsTab({ courseId }: { courseId: string }) {
  const sessions = useSessions(courseId);
  if (sessions.isPending) return <PageSkeleton />;
  if (sessions.isError) return <QueryError error={sessions.error} onRetry={() => void sessions.refetch()} />;
  if (!sessions.data.length) {
    return <Empty className="border"><EmptyHeader><EmptyTitle>No sessions yet</EmptyTitle><EmptyDescription>Start attendance to show a QR code in class.</EmptyDescription></EmptyHeader></Empty>;
  }
  return (
    <Card>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Started</TableHead><TableHead>Ends</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Present</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {sessions.data.map((session) => (
            <TableRow key={session.sessionId}>
              <TableCell>{formatDateTime(session.startTime)}</TableCell>
              <TableCell>{formatDateTime(session.actualEndTime ?? session.scheduledEndTime)}</TableCell>
              <TableCell>{session.status === 'OPEN' ? <Badge>Live</Badge> : <Badge variant="outline">Closed</Badge>}</TableCell>
              <TableCell className="text-right tabular-nums">{session.presentCount}</TableCell>
              <TableCell className="text-right">
                <Button asChild variant="ghost" size="sm"><Link to={`/sessions/${session.sessionId}/live`}>{session.status === 'OPEN' ? 'Show QR' : 'View'}</Link></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}

const EnrollSchema = z.object({ identifier: z.string().trim().min(2, 'Enter a student email or roll number.').max(254) });

/** Accepts either an email address or a roll number in one box. */
export function enrollmentBody(identifier: string): { email: string } | { rollNo: string } {
  const value = identifier.trim();
  return value.includes('@') ? { email: EmailSchema.parse(value) } : { rollNo: value.toUpperCase() };
}

function RosterTab({ courseId }: { courseId: string }) {
  const roster = useRoster(courseId);
  const enroll = useEnroll(courseId);
  const unenroll = useUnenroll(courseId);
  const form = useForm<z.input<typeof EnrollSchema>>({ resolver: zodResolver(EnrollSchema), defaultValues: { identifier: '' } });
  const submit = form.handleSubmit(async ({ identifier }) => {
    let body;
    try { body = enrollmentBody(identifier); } catch { form.setError('identifier', { message: 'Enter a valid email address.' }); return; }
    try {
      const added = await enroll.mutateAsync(body);
      toast.success(`${added.name ?? 'Student'} added to the roster`);
      form.reset();
    } catch (error) {
      form.setError('identifier', { message: errorMessage(error) });
    }
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Card className="lg:order-2">
        <CardHeader>
          <CardTitle className="text-base">Add a student</CardTitle>
          <CardDescription>Students must register first. Use the email or roll number they registered with.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate className="space-y-3">
            <TextField control={form.control} name="identifier" label="Email or roll number" placeholder="student@university.edu" autoComplete="off" />
            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? <Spinner /> : <UserPlusIcon />}Add to roster</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="self-start lg:order-1">
        {roster.isPending ? <CardContent><PageSkeleton /></CardContent> : roster.isError ? <CardContent><QueryError error={roster.error} /></CardContent> : roster.data.length === 0 ? (
          <Empty><EmptyHeader><EmptyTitle>No students enrolled</EmptyTitle><EmptyDescription>Add students to let them check in.</EmptyDescription></EmptyHeader></Empty>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Roll number</TableHead><TableHead className="hidden md:table-cell">Email</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
            <TableBody>
              {roster.data.map((student) => (
                <TableRow key={student.studentId}>
                  <TableCell className="font-medium">{student.name ?? 'Unknown student'}</TableCell>
                  <TableCell>{student.rollNo ?? '—'}</TableCell>
                  <TableCell className="hidden md:table-cell">{student.email ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Remove ${student.name ?? 'student'}`}><UserMinusIcon /></Button></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {student.name ?? 'this student'}?</AlertDialogTitle>
                          <AlertDialogDescription>They will no longer be able to check in. Past attendance is kept.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction variant="destructive" onClick={() => unenroll.mutate(student.studentId, {
                            onSuccess: () => toast.success('Student removed'),
                            onError: (error) => toast.error(errorMessage(error))
                          })}>Remove</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function ReportTab({ courseId, courseCode }: { courseId: string; courseCode: string }) {
  const report = useReport(courseId);
  const [downloading, setDownloading] = useState(false);
  async function download() {
    setDownloading(true);
    try {
      const blob = await apiBlob(`/courses/${courseId}/report?format=csv`);
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: `${courseCode}-attendance.csv` });
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDownloading(false);
    }
  }
  if (report.isPending) return <PageSkeleton />;
  if (report.isError) return <QueryError error={report.error} onRetry={() => void report.refetch()} />;
  const { rows, totalSessions } = report.data;
  const flagged = rows.filter((row) => row.belowThreshold).length;
  const average = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length * 10) / 10 : 0;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sessions held" value={totalSessions} />
        <Stat label="Average attendance" value={rows.length && totalSessions ? `${average}%` : '—'} />
        <Stat label="Below threshold" value={totalSessions ? flagged : '—'} tone={flagged && totalSessions ? 'warn' : undefined} />
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Per-student attendance</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void download()} disabled={downloading || !rows.length}>{downloading ? <Spinner /> : <DownloadIcon />}Download CSV</Button>
        </CardHeader>
        {rows.length === 0 ? (
          <Empty><EmptyHeader><EmptyTitle>No students to report on</EmptyTitle><EmptyDescription>Add students on the Roster tab.</EmptyDescription></EmptyHeader></Empty>
        ) : (
          <Table>
            <TableHeader><TableRow><TableHead>Student</TableHead><TableHead className="hidden sm:table-cell">Roll number</TableHead><TableHead className="text-right">Attended</TableHead><TableHead className="text-right">Rate</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.studentId}>
                  <TableCell className="font-medium">{row.name ?? 'Unknown student'}</TableCell>
                  <TableCell className="hidden sm:table-cell">{row.rollNo ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.attended}/{row.totalSessions}</TableCell>
                  <TableCell className="text-right tabular-nums">{totalSessions ? `${row.percentage}%` : '—'}</TableCell>
                  <TableCell>{!totalSessions ? <Badge variant="outline">No sessions</Badge> : row.belowThreshold ? <Badge variant="destructive">Below threshold</Badge> : <Badge variant="secondary">On track</Badge>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'warn' }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className={tone === 'warn' ? 'text-3xl text-destructive tabular-nums' : 'text-3xl tabular-nums'}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}
