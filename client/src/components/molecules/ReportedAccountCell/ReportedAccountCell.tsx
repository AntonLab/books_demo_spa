import type { FC } from 'react';
import { Button, Flex, Popconfirm, Tag, Tooltip } from 'antd';
import type { ReportedAccount } from 'shared';

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

  return (
    <Flex gap="small" align="center" wrap>
      {account.login}
      {account.atBanThreshold && <Tag color="error">Ban mark</Tag>}
      <Tooltip title={blockedReason}>
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
            disabled={blockedReason !== null || pending}
          >
            Ban user
          </Button>
        </Popconfirm>
      </Tooltip>
    </Flex>
  );
};
