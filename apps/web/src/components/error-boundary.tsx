import { Component, type ReactNode } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

/** Keeps a rendering error in one page from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon"><TriangleAlertIcon /></EmptyMedia>
          <EmptyTitle>Something went wrong</EmptyTitle>
          <EmptyDescription>This page hit an unexpected error. Reloading usually fixes it.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent><Button onClick={() => location.reload()}>Reload page</Button></EmptyContent>
      </Empty>
    );
  }
}
