import type { FC } from 'react';
import { Tag } from 'antd';
import styles from './TagList.module.css';

interface TagListProps {
  tags: readonly string[];
}

export const TagList: FC<TagListProps> = ({ tags }) =>
  tags.length === 0 ? null : (
    <ul className={styles.list}>
      {tags.map((tag) => (
        <li key={tag}>
          <Tag>{tag}</Tag>
        </li>
      ))}
    </ul>
  );
