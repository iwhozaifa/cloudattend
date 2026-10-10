import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/auth/auth-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { AuthAdapter } from '@/lib/auth/types';

export function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });
}

export function Providers({ adapter, children, queryClient }: { adapter: AuthAdapter; children: ReactNode; queryClient?: QueryClient }) {
  const [client] = useState(() => queryClient ?? createQueryClient());
  return (
    <ThemeProvider>
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <AuthProvider adapter={adapter}>{children}</AuthProvider>
          <Toaster richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
