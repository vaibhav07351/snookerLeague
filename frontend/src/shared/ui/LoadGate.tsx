import type { ReactNode } from 'react';

import type { StoreLoad } from '@/shared/hooks/use-store-reload';
import { ErrorState } from '@/shared/ui/ErrorState';
import { LoadingState } from '@/shared/ui/LoadingState';

interface LoadGateProps {
  load: Pick<StoreLoad, 'status' | 'retry'>;
  /** e.g. "Loading games". */
  loadingLabel: string;
  /** e.g. "Couldn't load your games". */
  errorTitle?: string;
  children: ReactNode;
}

/**
 * The one way a data screen shows its first load: a spinner with a label while loading,
 * an error with Retry if it failed, and only then the content (or its empty state).
 */
export function LoadGate({ load, loadingLabel, errorTitle, children }: LoadGateProps): ReactNode {
  if (load.status === 'loading') {
    return <LoadingState label={loadingLabel} />;
  }
  if (load.status === 'error') {
    return <ErrorState title={errorTitle} onRetry={load.retry} />;
  }
  return children;
}
