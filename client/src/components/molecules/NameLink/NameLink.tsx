import type { FC } from 'react';
import { Link } from 'react-router';

// A molecule, not inline `Link`s: five places name an Account (Card, Comment,
// ReadingListCard, ReportedAccountCell, ReportsPanel) and all point at the
// same public profile.
export const NameLink: FC<{ id: number; name: string }> = ({ id, name }) => (
  <Link to={`/accounts/${id}`}>{name}</Link>
);
