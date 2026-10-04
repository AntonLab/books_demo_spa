import type { FC } from 'react';
import { Button, Flex, Popconfirm, Tag, Tooltip } from 'antd';
import type { ReportedAccount } from 'shared';
import { NameLink } from '@/components/molecules/NameLink/NameLink';
import styles from './ReportedAccountCell.module.css';

interface Props {
  account: ReportedAccount | null;
  blockedReason: string | null;
  pending: boolean;
  onBan: () => void;
}

export const ReportedAccountCell: FC<Props> = ({
  account,
  blockedReason,
  pending,
  onBan,
}) => {
  if (!account) return 'Deleted account';
  const disabled = blockedReason !== null || pending;

  return (
    <Flex gap="small" align="center" wrap>
      <NameLink id={account.id} name={account.login} />
      {account.atBanThreshold && <Tag color="error">Ban mark</Tag>}
      <Tooltip title={blockedReason}>
        {/* A disabled button swallows mouse events, so the span takes them. */}
        <span className={styles.tooltipTarget}>
          <Popconfirm
            title={`Ban ${account.login}?`}
            okText="Yes, ban"
            okButtonProps={{ danger: true }}
            onConfirm={onBan}
          >
            <Button
              size="small"
              type="text"
              danger
              disabled={disabled}
              style={disabled ? { pointerEvents: 'none' } : undefined}
            >
              Ban user
            </Button>
          </Popconfirm>
        </span>
      </Tooltip>
    </Flex>
  );
};
