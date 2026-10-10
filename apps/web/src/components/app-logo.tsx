import { QrCodeIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AppLogo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2 font-semibold', className)}>
      <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <QrCodeIcon className="size-4" aria-hidden />
      </span>
      CloudAttend
    </span>
  );
}
