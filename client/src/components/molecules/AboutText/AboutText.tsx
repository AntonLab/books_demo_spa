import type { FC } from 'react';
import { Typography } from 'antd';
import styles from './AboutText.module.css';

const COLLAPSED_ROWS = 3;

export const AboutText: FC<{ text: string }> = ({ text }) => (
  <Typography.Paragraph
    className={styles.text}
    ellipsis={{
      rows: COLLAPSED_ROWS,
      expandable: 'collapsible',
      symbol: (expanded) => (expanded ? 'Show less' : 'Show more'),
    }}
  >
    {text}
  </Typography.Paragraph>
);
