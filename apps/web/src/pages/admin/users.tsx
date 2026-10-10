import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchIcon } from 'lucide-react';
import type { Role, User } from '@cloudattend/shared';
import { useMe } from '@/auth/auth-context';
import { PageHeader, PageSkeleton, QueryError } from '@/components/page';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { errorMessage } from '@/lib/api';
import { useAdminUsers, useSetRole } from '@/lib/queries';

type Filter = 'ALL' | Role;

export function AdminUsersPage() {
  const me = useMe();
  const users = useAdminUsers();
  const [filter, setFilter] = useState<Filter>('ALL');
  const [search, setSearch] = useState('');
  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (users.data ?? []).filter((user) => (filter === 'ALL' || user.role === filter)
      && (!term || [user.name, user.email, user.rollNo].some((value) => value?.toLowerCase().includes(term))));
  }, [users.data, filter, search]);

  return (
    <>
      <PageHeader title="Users & roles" description="Promote registered users to teachers or return them to students. Changes sign the user out so the new role takes effect." />
      <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)} className="min-w-0 gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <TabsList>
          <TabsTrigger value="ALL">All</TabsTrigger>
          <TabsTrigger value="STUDENT">Students</TabsTrigger>
          <TabsTrigger value="TEACHER">Teachers</TabsTrigger>
        </TabsList>
        <div className="relative sm:w-72">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input type="search" placeholder="Search name, email, roll number" aria-label="Search users" className="pl-8" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>
      </div>
      <TabsContent value={filter}>
      {users.isPending ? <PageSkeleton /> : users.isError ? <QueryError error={users.error} onRetry={() => void users.refetch()} /> : (
        <Card className="py-0">
          {visible.length === 0 ? (
            <Empty><EmptyHeader><EmptyTitle>No matching users</EmptyTitle><EmptyDescription>Try a different search or filter.</EmptyDescription></EmptyHeader></Empty>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead className="hidden md:table-cell">Email</TableHead><TableHead className="hidden sm:table-cell">Roll number</TableHead><TableHead>Role</TableHead><TableHead><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
              <TableBody>
                {visible.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell className="font-medium">{user.name}<span className="block text-xs font-normal text-muted-foreground md:hidden">{user.email}</span></TableCell>
                    <TableCell className="hidden md:table-cell">{user.email}</TableCell>
                    <TableCell className="hidden sm:table-cell">{user.rollNo ?? '—'}</TableCell>
                    <TableCell><Badge variant={user.role === 'TEACHER' ? 'default' : 'secondary'}>{user.role === 'TEACHER' ? 'Teacher' : 'Student'}</Badge></TableCell>
                    <TableCell className="text-right">{user.userId === me.userId ? <span className="text-xs text-muted-foreground">You</span> : <RoleChange user={user} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
      </TabsContent>
      </Tabs>
    </>
  );
}

function RoleChange({ user }: { user: User }) {
  const setRole = useSetRole();
  const target: Role = user.role === 'TEACHER' ? 'STUDENT' : 'TEACHER';
  const label = target === 'TEACHER' ? 'Make teacher' : 'Make student';
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button variant="outline" size="sm" disabled={setRole.isPending} aria-label={`${label}: ${user.name}`}>{label}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {user.name} ({user.email}) will become a {target === 'TEACHER' ? 'teacher and can create courses and take attendance' : 'student'}. They will be signed out on all devices.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => setRole.mutate({ userId: user.userId, role: target }, {
            onSuccess: () => toast.success(`${user.name} is now a ${target === 'TEACHER' ? 'teacher' : 'student'}`),
            onError: (error) => toast.error(errorMessage(error))
          })}>{label}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
