import type { FC } from 'react';
import { Alert, Flex, Tabs, Typography } from 'antd';
import { useParams, useSearchParams } from 'react-router';
import { ApiError } from '@/api/client';
import { AccountAvatar } from '@/components/molecules/AccountAvatar/AccountAvatar';
import { GoneRedirect } from '@/components/molecules/GoneRedirect/GoneRedirect';
import { PageSpinner } from '@/components/molecules/PageSpinner/PageSpinner';
import { PublicWorksList } from '@/components/organisms/PublicWorksList/PublicWorksList';
import { PublicProfileTab } from '@/components/organisms/PublicProfileTab/PublicProfileTab';
import { lastOnlineLabel } from '@/format/lastOnline';
import { usePublicProfile } from '@/queries/accounts';
import styles from './PublicProfilePage.module.css';

const PAGE_GONE = 'Page not found.';

export const PublicProfilePage: FC = () => {
  const id = Number(useParams().id);
  // Not an id the server could answer for, so it is not asked.
  return Number.isInteger(id) && id > 0 ? (
    // Keyed so every state resets when the id changes.
    <PublicProfileView key={id} id={id} />
  ) : (
    <GoneRedirect message={PAGE_GONE} />
  );
};

const PublicProfileView: FC<{ id: number }> = ({ id }) => {
  const query = usePublicProfile(id);
  const [, setSearchParams] = useSearchParams();

  if (query.isError) {
    // A blocked, pending or deleted Account answers 404, as a missing one.
    return query.error instanceof ApiError && query.error.status === 404 ? (
      <GoneRedirect message={PAGE_GONE} />
    ) : (
      <Alert type="error" title="Could not load this profile." />
    );
  }
  if (query.isPending) return <PageSpinner />;

  const profile = query.data;
  const name = `${profile.firstName} ${profile.lastName}`;
  const online = lastOnlineLabel(profile.lastSeenAt);

  return (
    <>
      <Flex gap="middle" align="center" wrap className={styles.header}>
        <AccountAvatar avatarUrl={profile.avatarUrl} name={name} size="large" />
        <div>
          <Typography.Title level={2} className={styles.name}>
            {name}
          </Typography.Title>
          {online !== null && (
            <Typography.Text type="secondary">{online}</Typography.Text>
          )}
        </div>
      </Flex>
      {/* Uncontrolled: ADR-0010. The tab is not in the URL, so a switch clears
          the list's paging and sort with its own replace. */}
      <Tabs
        defaultActiveKey="profile"
        destroyOnHidden
        onChange={() => setSearchParams({}, { replace: true })}
        items={[
          {
            key: 'profile',
            label: 'Profile',
            children: <PublicProfileTab profile={profile} />,
          },
          ...(profile.seriesCount > 0
            ? [
                {
                  key: 'series',
                  label: `Series (${profile.seriesCount})`,
                  children: <PublicWorksList kind="series" userId={id} />,
                },
              ]
            : []),
          ...(profile.bookCount > 0
            ? [
                {
                  key: 'books',
                  label: `Books (${profile.bookCount})`,
                  children: <PublicWorksList kind="books" userId={id} />,
                },
              ]
            : []),
        ]}
      />
    </>
  );
};
