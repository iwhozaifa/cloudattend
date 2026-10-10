import { ClipboardListIcon } from 'lucide-react';
import { formatDateTime, PageHeader, PageSkeleton, QueryError } from '@/components/page';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMyAttendance } from '@/lib/queries';
import { AttendanceCard } from '../dashboard';

export function MyAttendancePage() {
  const attendance = useMyAttendance();
  return (
    <>
      <PageHeader title="My attendance" description="Your attendance rate per course and every check-in you have made." />
      {attendance.isPending ? <PageSkeleton /> : attendance.isError ? <QueryError error={attendance.error} onRetry={() => void attendance.refetch()} /> : attendance.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader><EmptyMedia variant="icon"><ClipboardListIcon /></EmptyMedia><EmptyTitle>No attendance yet</EmptyTitle><EmptyDescription>Once you are enrolled and check in, your record appears here.</EmptyDescription></EmptyHeader>
        </Empty>
      ) : (
        <div className="space-y-6">
          {attendance.data.map((summary) => (
            <section key={summary.course.courseId} aria-label={`${summary.course.courseCode} attendance`} className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
              <AttendanceCard summary={summary} />
              <Card>
                <CardHeader className="text-sm font-medium">Check-ins</CardHeader>
                <CardContent>
                  {summary.records.length === 0 ? <p className="text-sm text-muted-foreground">No check-ins recorded for this course yet.</p> : (
                    <Table>
                      <TableHeader><TableRow><TableHead>Date and time</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                      <TableBody>{summary.records.map((record) => <TableRow key={record.sessionId}><TableCell>{formatDateTime(record.checkInTime)}</TableCell><TableCell>Present</TableCell></TableRow>)}</TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
