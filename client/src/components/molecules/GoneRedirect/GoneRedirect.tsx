import type { FC } from 'react';
import { PageSpinner } from '@/components/molecules/PageSpinner/PageSpinner';
import { usePageGuard } from '@/hooks/usePageGuard';

// A route whose page is gone: shows `message`, then replaces to `to` (Home by
// default) so Back does not return to the dead path.
export const GoneRedirect: FC<{ message: string; to?: string }> = ({
  message,
  to,
}) => {
  usePageGuard('denied', message, to);
  return <PageSpinner />;
};
