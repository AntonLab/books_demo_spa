import { useState, type FC } from 'react';
import { Flex, Popconfirm } from 'antd';
import { CheckOutlined, CloseOutlined, EyeOutlined } from '@ant-design/icons';
import type { ReportStatus } from 'shared';
import { IconButton } from '@/components/molecules/IconButton/IconButton';

const OWN_COMMENT = "You can't moderate your own comment";

interface Props {
  status: ReportStatus;
  isOwnComment: boolean;
  disabled: boolean;
  onTake: () => void;
  onUphold: () => void;
  onDismiss: () => void;
}

export const ReportActions: FC<Props> = ({
  status,
  isOwnComment,
  disabled,
  onTake,
  onUphold,
  onDismiss,
}) => {
  const [confirming, setConfirming] = useState(false);
  const off = disabled || isOwnComment;
  const label = (name: string) => (isOwnComment ? OWN_COMMENT : name);

  if (status === 'new') {
    return (
      <IconButton
        size="small"
        type="text"
        icon={<EyeOutlined />}
        label={label('Take')}
        disabled={off}
        onClick={onTake}
      />
    );
  }
  if (status !== 'in_review') return null;

  return (
    <Flex gap="small">
      <Popconfirm
        title="Uphold this report?"
        description="The comment is removed and every open report on it is settled."
        okText="Yes, uphold"
        disabled={off}
        onConfirm={onUphold}
        onOpenChange={setConfirming}
      >
        <IconButton
          size="small"
          type="text"
          icon={<CheckOutlined />}
          label={label('Uphold')}
          disabled={off}
          tooltipHidden={confirming}
        />
      </Popconfirm>
      <IconButton
        size="small"
        type="text"
        icon={<CloseOutlined />}
        label={label('Dismiss')}
        disabled={off}
        onClick={onDismiss}
      />
    </Flex>
  );
};
