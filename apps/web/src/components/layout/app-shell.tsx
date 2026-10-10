import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useMe } from '@/auth/auth-context';
import { ErrorBoundary } from '@/components/error-boundary';
import { PageSkeleton } from '@/components/page';
import { Separator } from '@/components/ui/separator';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { AppSidebar } from './app-sidebar';
import { ThemeToggle } from './theme-toggle';

export function AppShell() {
  const me = useMe();
  return (
    <SidebarProvider>
      <AppSidebar me={me} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur">
          <SidebarTrigger className="-ml-1" aria-label="Toggle navigation" />
          <Separator orientation="vertical" className="mr-2 h-4! self-center" />
          <span className="text-sm text-muted-foreground">{me.role === 'TEACHER' ? 'Teacher' : 'Student'}{me.isAdmin ? ' · Administrator' : ''}</span>
          <div className="ml-auto"><ThemeToggle /></div>
        </header>
        <main id="main" className="flex flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
          <ErrorBoundary>
            <Suspense fallback={<PageSkeleton />}><Outlet /></Suspense>
          </ErrorBoundary>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
