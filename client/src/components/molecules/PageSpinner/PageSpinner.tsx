import type { FC } from 'react';
import { Spin } from 'antd';
import styles from './PageSpinner.module.css';

export const PageSpinner: FC = () => (
  <div role="status" aria-label="Loading" className={styles.box}>
    <Spin size="large" />
  </div>
);
