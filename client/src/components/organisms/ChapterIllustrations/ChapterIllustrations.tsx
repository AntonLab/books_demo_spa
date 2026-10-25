import type { FC } from 'react';
import { Typography } from 'antd';
import { useIllustrations } from '@/queries/illustrations';
import { illustrationImageUrl } from '@/types/illustration';
import styles from './ChapterIllustrations.module.css';

interface ChapterIllustrationsProps {
  chapterId: number;
}

// Pictures are an extra: while loading, on a failure and when empty, the
// reader sees the text alone.
export const ChapterIllustrations: FC<ChapterIllustrationsProps> = ({
  chapterId,
}) => {
  const { data } = useIllustrations(chapterId);
  if (!data || data.items.length === 0) return null;

  return (
    <section aria-label="Illustrations" className={styles.illustrations}>
      {data.items.map((item, at) => (
        <figure key={item.id} className={styles.figure}>
          <img
            className={styles.image}
            src={illustrationImageUrl(item)}
            alt={`Illustration ${at + 1}`}
            loading="lazy"
            {...(item.width !== null && item.height !== null
              ? { width: item.width, height: item.height }
              : {})}
          />
          {item.caption !== null && (
            <figcaption>
              <Typography.Text type="secondary" className={styles.caption}>
                {item.caption}
              </Typography.Text>
            </figcaption>
          )}
        </figure>
      ))}
    </section>
  );
};
