import type { FC } from 'react';
import { Flex, Typography } from 'antd';
import { READING_STATUS_LABELS } from '@/types/library';
import type { LibraryCounts } from '@/types/library';

export const BookLibraryCounts: FC<{ counts: LibraryCounts }> = ({
  counts,
}) => (
  <Flex wrap gap={12}>
    <Typography.Text>
      {`In ${counts.inLibraries} ${counts.inLibraries === 1 ? 'library' : 'libraries'}`}
    </Typography.Text>
    <Typography.Text type="secondary">
      {`${READING_STATUS_LABELS.reading} ${counts.reading}`}
    </Typography.Text>
    <Typography.Text type="secondary">
      {`${READING_STATUS_LABELS.plan_to_read} ${counts.planToRead}`}
    </Typography.Text>
    <Typography.Text type="secondary">
      {`${READING_STATUS_LABELS.read} ${counts.read}`}
    </Typography.Text>
  </Flex>
);
