import { useEffect, type FC } from 'react';
import {
  Button,
  Col,
  Collapse,
  DatePicker,
  Flex,
  Form,
  Input,
  Row,
  Select,
} from 'antd';
import type { ColProps, FormRule } from 'antd';
import type { Dayjs } from 'dayjs';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  BOOK_SORT_LABELS,
  BOOK_SORTS,
  BOOK_STATUS_LABELS,
  RANGE_ORDER,
  SEARCH_TEXT_MAX_LENGTH,
  SEARCHABLE_BOOK_STATUSES,
} from '@/types/book';
import type {
  BookSearchFormValues,
  SearchFieldError,
} from '@/types/bookSearch';
import type { PublicGenre } from '@/types/genre';
import styles from './SearchForm.module.css';

interface SearchFormProps {
  // Read once, on mount: the caller remounts the form when the URL changes.
  initialValues: BookSearchFormValues;
  genres: PublicGenre[];
  // How many filters the URL holds, shown on the header while closed.
  filterCount: number;
  // A 400's issues, each shown on the field it names.
  fieldErrors: SearchFieldError[];
  onSearch: (values: BookSearchFormValues) => void;
  onReset: () => void;
}

// One column on a phone, two on a tablet, three from `lg`.
const FIELD_COLUMNS: ColProps = { xs: 24, sm: 12, lg: 8 };

// The server trims before it counts, so the rule does too.
const textRule: FormRule = {
  type: 'string',
  transform: (value?: string) => value?.trim(),
  max: SEARCH_TEXT_MAX_LENGTH,
  message: `At most ${SEARCH_TEXT_MAX_LENGTH} characters.`,
};

// On the "from" field, as the server pins it: a start after the end is
// refused, and either end may be left open.
const startsBefore =
  (toField: 'releasedTo' | 'updatedTo'): FormRule =>
  ({ getFieldValue }) => ({
    validator: (_rule, from: Dayjs | null | undefined) => {
      const to = getFieldValue(toField) as Dayjs | null | undefined;
      return from && to && from.isAfter(to, 'day')
        ? Promise.reject(new Error(RANGE_ORDER))
        : Promise.resolve();
    },
  });

export const SearchForm: FC<SearchFormProps> = ({
  initialValues,
  genres,
  filterCount,
  fieldErrors,
  onSearch,
  onReset,
}) => {
  const [form] = Form.useForm<BookSearchFormValues>();
  const expanded = useAppSelector(
    (state) => state.devicePreferences.searchFormExpanded
  );
  const dispatch = useAppDispatch();

  useEffect(() => {
    form.setFields(fieldErrors);
  }, [form, fieldErrors]);

  return (
    <Collapse
      className={styles.collapse}
      activeKey={expanded ? ['filters'] : []}
      onChange={(keys) =>
        dispatch(devicePreferences.searchFormExpandedChanged(keys.length > 0))
      }
      items={[
        {
          key: 'filters',
          label:
            !expanded && filterCount > 0
              ? `Filters (${filterCount})`
              : 'Filters',
          // Rendered while closed too, so the form instance stays connected
          // and the server's field errors have somewhere to land.
          forceRender: true,
          children: (
            <Form<BookSearchFormValues>
              form={form}
              name="search"
              layout="vertical"
              initialValues={initialValues}
              onFinish={onSearch}
            >
              <Row gutter={16}>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item name="q" label="Text" rules={[textRule]}>
                    <Input placeholder="Title or description" />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item name="author" label="Author" rules={[textRule]}>
                    <Input placeholder="Login or name" />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item
                    name="seriesTitle"
                    label="Series"
                    rules={[textRule]}
                  >
                    <Input placeholder="Series title" />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item name="genre" label="Genre">
                    <Select
                      allowClear
                      placeholder="Any"
                      options={genres.map((genre) => ({
                        value: genre.id,
                        label: genre.name,
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item name="status" label="Status">
                    <Select
                      allowClear
                      placeholder="Any"
                      options={SEARCHABLE_BOOK_STATUSES.map((status) => ({
                        value: status,
                        label: BOOK_STATUS_LABELS[status],
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item name="sort" label="Sort by">
                    <Select
                      options={BOOK_SORTS.map((sort) => ({
                        value: sort,
                        label: BOOK_SORT_LABELS[sort],
                      }))}
                    />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item
                    name="releasedFrom"
                    label="Released from"
                    dependencies={['releasedTo']}
                    rules={[startsBefore('releasedTo')]}
                  >
                    <DatePicker className={styles.picker} />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item name="releasedTo" label="Released to">
                    <DatePicker className={styles.picker} />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item
                    name="updatedFrom"
                    label="Updated from"
                    dependencies={['updatedTo']}
                    rules={[startsBefore('updatedTo')]}
                  >
                    <DatePicker className={styles.picker} />
                  </Form.Item>
                </Col>
                <Col {...FIELD_COLUMNS}>
                  <Form.Item name="updatedTo" label="Updated to">
                    <DatePicker className={styles.picker} />
                  </Form.Item>
                </Col>
              </Row>
              <Flex gap="small">
                <Button type="primary" htmlType="submit">
                  Search
                </Button>
                <Button onClick={onReset}>Reset</Button>
              </Flex>
            </Form>
          ),
        },
      ]}
    />
  );
};
