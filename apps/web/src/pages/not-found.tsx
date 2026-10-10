import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';

export function NotFoundPage() {
  return (
    <Empty>
      <EmptyHeader><EmptyTitle><h1>Page not found</h1></EmptyTitle><EmptyDescription>The page you are looking for does not exist or has moved.</EmptyDescription></EmptyHeader>
      <EmptyContent><Button asChild><Link to="/">Go to dashboard</Link></Button></EmptyContent>
    </Empty>
  );
}
