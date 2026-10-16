import type { FC } from 'react';
import { Link } from 'react-router';
import type { UserStatus } from 'shared';

// A molecule, not inline `Link`s: five places name an Account (Card, Comment,
// ReadingListCard, ReportedAccountCell, ReportsPanel) and all point at the
// same public profile. A Blocked or Pending Account has no public page (it
// redirects), so only an Active name links.
export const NameLink: FC<{ id: number; name: string; status: UserStatus }> = ({
  id,
  name,
  status,
}) =>
  status === 'active' ? (
    <Link to={`/accounts/${id}`}>{name}</Link>
  ) : (
    <>{name}</>
  );
