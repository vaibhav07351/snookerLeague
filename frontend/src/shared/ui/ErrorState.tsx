import type { ReactNode } from 'react';

import { EmptyState } from '@/shared/ui/EmptyState';

interface ErrorStateProps {
  /** What could not be loaded, e.g. "Couldn't load your games". */
  title?: string;
  message?: string;
  onRetry: () => void;
}

/** A load that failed: says so plainly and offers Retry, never an empty list. */
export function ErrorState({
  title = "Couldn't load this",
  message = 'Something went wrong. Check your connection and try again.',
  onRetry,
}: ErrorStateProps): ReactNode {
  return (
    <EmptyState
      icon="cloud-offline-outline"
      title={title}
      message={message}
      actionLabel="Retry"
      onAction={onRetry}
    />
  );
}
