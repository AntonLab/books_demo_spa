import { useEffect, type FC } from 'react';
import {
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Form,
  Input,
  Row,
  Select,
} from 'antd';
import type { ColProps, FormRule } from 'antd';
import { FilterOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  BOOK_SORTS,
  RANGE_ORDER,
  SEARCH_TEXT_MAX_LENGTH,
  SEARCHABLE_BOOK_STATUSES,
} from 'shared';
import { BOOK_SORT_LABELS, BOOK_STATUS_LABELS } from '@/types/book';
import type {
  BookSearchFormValues,
  SearchFieldError,
} from '@/types/bookSearch';
import type { PublicGenre } from 'shared';
import spacing from '@/theme/spacing.module.css';
import styles from './SearchForm.module.css';

interface SearchFormProps {
  // Named by `SearchFiltersToggle`'s `aria-controls`.
  id: string;
  // Read once, on mount: the caller remounts the form when the URL changes.
  initialValues: BookSearchFormValues;
  genres: PublicGenre[];
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

// The pickers' side of `startsBefore`: each end greys out the days past the
// other. The rule stays, for a range the URL brings in already reversed.
const after =
  (limit: Dayjs | null | undefined) =>
  (day: Dayjs): boolean =>
    limit != null && day.isAfter(limit, 'day');
const before =
  (limit: Dayjs | null | undefined) =>
  (day: Dayjs): boolean =>
    limit != null && day.isBefore(limit, 'day');

export const SearchForm: FC<SearchFormProps> = ({
  id,
  initialValues,
  genres,
  fieldErrors,
  onSearch,
  onReset,
}) => {
  const [form] = Form.useForm<BookSearchFormValues>();
  const releasedFrom = Form.useWatch('releasedFrom', form);
  const releasedTo = Form.useWatch('releasedTo', form);
  const updatedFrom = Form.useWatch('updatedFrom', form);
  const updatedTo = Form.useWatch('updatedTo', form);

  useEffect(() => {
    form.setFields(fieldErrors);
  }, [form, fieldErrors]);

  return (
    <Card id={id} className={spacing.gapBelow}>
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
            <Form.Item name="seriesTitle" label="Series" rules={[textRule]}>
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
              <DatePicker
                className={styles.picker}
                disabledDate={after(releasedTo)}
              />
            </Form.Item>
          </Col>
          <Col {...FIELD_COLUMNS}>
            <Form.Item name="releasedTo" label="Released to">
              <DatePicker
                className={styles.picker}
                disabledDate={before(releasedFrom)}
              />
            </Form.Item>
          </Col>
          <Col {...FIELD_COLUMNS}>
            <Form.Item
              name="updatedFrom"
              label="Updated from"
              dependencies={['updatedTo']}
              rules={[startsBefore('updatedTo')]}
            >
              <DatePicker
                className={styles.picker}
                disabledDate={after(updatedTo)}
              />
            </Form.Item>
          </Col>
          <Col {...FIELD_COLUMNS}>
            <Form.Item name="updatedTo" label="Updated to">
              <DatePicker
                className={styles.picker}
                disabledDate={before(updatedFrom)}
              />
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
    </Card>
  );
};

// Collapses the form above without unmounting it, so the form instance stays
// connected and the server's field errors have somewhere to land. A Device
// preference, so the choice holds across searches on this device.
export const SearchFiltersToggle: FC<{
  controls: string;
  filterCount: number;
}> = ({ controls, filterCount }) => {
  const expanded = useAppSelector(
    (state) => state.devicePreferences.searchFormExpanded
  );
  const dispatch = useAppDispatch();

  return (
    <Button
      icon={<FilterOutlined aria-hidden />}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={() =>
        dispatch(devicePreferences.searchFormExpandedChanged(!expanded))
      }
    >
      {!expanded && filterCount > 0 ? `Filters (${filterCount})` : 'Filters'}
    </Button>
  );
};
