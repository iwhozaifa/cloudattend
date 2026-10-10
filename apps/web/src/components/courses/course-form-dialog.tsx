import { useEffect, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';
import type { Course } from '@cloudattend/shared';
import { TextField } from '@/components/form-fields';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { Spinner } from '@/components/ui/spinner';
import { errorMessage } from '@/lib/api';
import type { CourseInput } from '@/lib/queries';

export const CourseFormSchema = z.object({
  courseCode: z.string().trim().min(2, 'Use at least 2 characters.').max(20).transform((value) => value.toUpperCase()),
  courseName: z.string().trim().min(2, 'Use at least 2 characters.').max(120),
  semester: z.string().trim().min(2, 'Use at least 2 characters.').max(50),
  section: z.string().trim().min(1, 'Enter a section.').max(20),
  attendanceThreshold: z.coerce.number({ invalid_type_error: 'Enter a number.' }).int('Use a whole number.').min(1, 'Use 1–100.').max(100, 'Use 1–100.')
});
type FormValues = z.input<typeof CourseFormSchema>;

const blank: FormValues = { courseCode: '', courseName: '', semester: '', section: '', attendanceThreshold: 75 };

export function CourseFormDialog({ trigger, course, title, submitLabel, onSubmit }: {
  trigger: ReactNode;
  course?: Course;
  title: string;
  submitLabel: string;
  onSubmit: (input: CourseInput) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const form = useForm<FormValues>({ resolver: zodResolver(CourseFormSchema), defaultValues: course ?? blank });
  useEffect(() => { if (open) form.reset(course ?? blank); }, [open, course, form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      await onSubmit(CourseFormSchema.parse(values));
      setOpen(false);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Students below the attendance threshold are flagged in reports.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="courseCode" label="Course code" placeholder="CS101" autoComplete="off" />
              <TextField control={form.control} name="section" label="Section" placeholder="A" autoComplete="off" />
            </div>
            <TextField control={form.control} name="courseName" label="Course name" placeholder="Introduction to Cloud Computing" autoComplete="off" />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="semester" label="Semester" placeholder="Fall 2026" autoComplete="off" />
              <TextField control={form.control} name="attendanceThreshold" label="Attendance threshold (%)" type="number" inputMode="numeric" min={1} max={100} />
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting && <Spinner />}{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
