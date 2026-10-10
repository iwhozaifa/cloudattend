import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { BookOpenIcon, ChevronRightIcon, PlusIcon, QrCodeIcon } from 'lucide-react';
import type { Course, MyCourseAttendance } from '@cloudattend/shared';
import { useMe } from '@/auth/auth-context';
import { CourseFormDialog } from '@/components/courses/course-form-dialog';
import { PageHeader, PageSkeleton, QueryError } from '@/components/page';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Progress } from '@/components/ui/progress';
import { useCourses, useCreateCourse, useMyAttendance } from '@/lib/queries';

export function DashboardPage() {
  const me = useMe();
  return me.role === 'TEACHER' ? <TeacherDashboard /> : <StudentDashboard />;
}

function TeacherDashboard() {
  const me = useMe();
  const courses = useCourses<Course>();
  const create = useCreateCourse();
  const newCourse = (
    <CourseFormDialog title="Create a course" submitLabel="Create course"
      trigger={<Button><PlusIcon />New course</Button>}
      onSubmit={async (input) => { const course = await create.mutateAsync(input); toast.success(`${course.courseCode} created`); }} />
  );
  return (
    <>
      <PageHeader title="My courses" description={`Welcome back, ${me.name.split(' ')[0]}. Open a course to take attendance, manage the roster, or see reports.`} actions={newCourse} />
      {courses.isPending ? <PageSkeleton /> : courses.isError ? <QueryError error={courses.error} onRetry={() => void courses.refetch()} /> : courses.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpenIcon /></EmptyMedia>
            <EmptyTitle>No courses yet</EmptyTitle>
            <EmptyDescription>Create your first course, then add students by email or roll number.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>{newCourse}</EmptyContent>
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Courses">
          {courses.data.map((course) => (
            <li key={course.courseId}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <Badge variant="secondary" className="w-fit">{course.courseCode}</Badge>
                  <CardTitle className="text-lg">{course.courseName}</CardTitle>
                  <CardDescription>{course.semester} · Section {course.section}</CardDescription>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">Attendance threshold {course.attendanceThreshold}%</CardContent>
                <CardFooter className="mt-auto">
                  <Button asChild variant="outline" className="w-full">
                    <Link to={`/courses/${course.courseId}`} aria-label={`Open ${course.courseCode} ${course.courseName}`}>Open course<ChevronRightIcon /></Link>
                  </Button>
                </CardFooter>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StudentDashboard() {
  const me = useMe();
  const attendance = useMyAttendance();
  return (
    <>
      <PageHeader title={`Hi, ${me.name.split(' ')[0]}`} description="Scan the QR code your instructor shows in class to record attendance."
        actions={<Button asChild size="lg"><Link to="/scan"><QrCodeIcon />Scan QR code</Link></Button>} />
      {attendance.isPending ? <PageSkeleton /> : attendance.isError ? <QueryError error={attendance.error} onRetry={() => void attendance.refetch()} /> : attendance.data.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon"><BookOpenIcon /></EmptyMedia>
            <EmptyTitle>You&apos;re not enrolled in any courses yet</EmptyTitle>
            <EmptyDescription>Ask your instructor to add you using your email <strong>{me.email}</strong>{me.rollNo && <> or roll number <strong>{me.rollNo}</strong></>}.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Enrolled courses">
          {attendance.data.map((summary) => <li key={summary.course.courseId}><AttendanceCard summary={summary} /></li>)}
        </ul>
      )}
    </>
  );
}

export function AttendanceCard({ summary }: { summary: MyCourseAttendance }) {
  const { course } = summary;
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{course.courseCode}</Badge>
          {summary.belowThreshold && summary.totalSessions > 0 && <Badge variant="destructive">Below {course.attendanceThreshold}%</Badge>}
        </div>
        <CardTitle className="text-lg">{course.courseName}</CardTitle>
        <CardDescription>{course.semester} · Section {course.section}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-2xl font-semibold tabular-nums">{summary.totalSessions === 0 ? '—' : `${summary.percentage}%`}</span>
          <span className="text-muted-foreground">{summary.attended} of {summary.totalSessions} sessions</span>
        </div>
        <Progress value={summary.totalSessions === 0 ? 0 : summary.percentage} aria-label={`${course.courseCode} attendance`} />
      </CardContent>
    </Card>
  );
}
