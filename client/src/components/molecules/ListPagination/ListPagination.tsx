import type { FC } from 'react';
import { Pagination } from 'antd';
import { PAGE_SIZE_OPTIONS } from '@/constants/pagination';

interface ListPaginationProps {
  current: number;
  pageSize: number;
  total: number;
  onChange: (page: number, pageSize: number) => void;
  className?: string;
}

// antd keeps the page number on a size change; a new size starts at page 1.
export const ListPagination: FC<ListPaginationProps> = ({
  current,
  pageSize,
  total,
  onChange,
  className,
}) =>
  total <= PAGE_SIZE_OPTIONS[0] ? null : (
    <Pagination
      className={className}
      align="center"
      current={current}
      pageSize={pageSize}
      total={total}
      showSizeChanger
      pageSizeOptions={[...PAGE_SIZE_OPTIONS]}
      onChange={(page, size) => onChange(size === pageSize ? page : 1, size)}
    />
  );
