import { useEffect, useState, type FC } from 'react';
import {
  AutoComplete,
  Button,
  Card,
  Col,
  DatePicker,
  Flex,
  Form,
  Row,
  Select,
  Spin,
} from 'antd';
import type { ColProps, FormRule } from 'antd';
import type { DefaultOptionType } from 'antd/es/select';
import { useNavigate } from 'react-router';
import { FilterOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import { devicePreferences } from '@/store/devicePreferencesSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { authorLabelOf, useSuggestions } from '@/queries/suggestions';
import type { AuthorSummary, PublicSeries } from '@/types/api';
import type { PublicBook } from '@/types/book';
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

// One column on a phone, two on a tablet, three from `lg`, four from `xl`:
// four at `lg` leave a date range's pickers too narrow for a whole day.
const FIELD_COLUMNS: ColProps = { xs: 24, sm: 12, lg: 8, xl: 6 };

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

// The server already matched the text, so antd must not filter again: it
// would drop a login matched by first name. Fires on typing only, never on a
// pick.
const suggestOn = (onType: (text: string) => void) => ({
  filterOption: false as const,
  onSearch: onType,
});

// What a pick hands back beside the text it fills in.
interface IdOption extends DefaultOptionType {
  value: string;
  id: number;
}

// AutoComplete takes no `loading`. A term's options are empty until its
// request lands, so the empty-list slot is where the spinner shows; once it
// lands with nothing, the list stays shut.
const pendingOf = (isFetching: boolean) =>
  isFetching ? <Spin size="small" aria-label="Loading suggestions" /> : null;

// Picking a book opens it, so its option's value is its id and never lands
// in the field; two books sharing a title stay two options.
const bookOptions = (books: PublicBook[]) =>
  books.map((book) => ({
    value: String(book.id),
    label: book.title,
  }));

// The value is the title the field shows, so it must be unique.
// ponytail: series sharing a title offer only the first; label them apart
// (by author) if that ever happens.
const seriesOptions = (series: PublicSeries[]): IdOption[] => {
  const seen = new Set<string>();
  return series
    .filter((entry) => !seen.has(entry.title) && seen.add(entry.title))
    .map((entry) => ({ value: entry.title, id: entry.id }));
};

// Each author is offered by login: the server matches `author` against
// login, first or last name one at a time, so "First Last" would find nothing.
const authorOptions = (authors: AuthorSummary[]): IdOption[] =>
  authors.map((author) => ({
    value: author.login,
    label: authorLabelOf(author),
    id: author.id,
  }));

export const SearchForm: FC<SearchFormProps> = ({
  id,
  initialValues,
  genres,
  fieldErrors,
  onSearch,
  onReset,
}) => {
  const [form] = Form.useForm<BookSearchFormValues>();
  const navigate = useNavigate();
  const releasedFrom = Form.useWatch('releasedFrom', form);
  const releasedTo = Form.useWatch('releasedTo', form);
  const updatedFrom = Form.useWatch('updatedFrom', form);
  const updatedTo = Form.useWatch('updatedTo', form);
  // Set only by typing, not by the values the URL fills in, so opening a
  // search asks for no suggestions.
  const [typedText, setTypedText] = useState('');
  const [typedAuthor, setTypedAuthor] = useState('');
  const [typedSeries, setTypedSeries] = useState('');
  const books = useSuggestions('books', typedText);
  const authors = useSuggestions('authors', typedAuthor);
  const series = useSuggestions('series', typedSeries);

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
              <AutoComplete
                placeholder="Title or description"
                allowClear
                onClear={() => setTypedText('')}
                showSearch={suggestOn(setTypedText)}
                notFoundContent={pendingOf(books.isFetching)}
                options={bookOptions(books.items)}
                onSelect={(bookId) => void navigate(`/books/${bookId}`)}
              />
            </Form.Item>
          </Col>
          <Col {...FIELD_COLUMNS}>
            <Form.Item name="author" label="Author" rules={[textRule]}>
              <AutoComplete<string, IdOption>
                placeholder="Login or name"
                allowClear
                // A clear is not a keystroke, so the typing handler misses it.
                onClear={() => {
                  setTypedAuthor('');
                  form.setFieldValue('authorId', undefined);
                }}
                showSearch={suggestOn((text) => {
                  setTypedAuthor(text);
                  form.setFieldValue('authorId', undefined);
                })}
                notFoundContent={pendingOf(authors.isFetching)}
                options={authorOptions(authors.items)}
                onSelect={(_login, option) =>
                  form.setFieldValue('authorId', option.id)
                }
              />
            </Form.Item>
            <Form.Item name="authorId" hidden noStyle />
          </Col>
          <Col {...FIELD_COLUMNS}>
            <Form.Item name="seriesTitle" label="Series" rules={[textRule]}>
              <AutoComplete<string, IdOption>
                placeholder="Series title"
                allowClear
                onClear={() => {
                  setTypedSeries('');
                  form.setFieldValue('seriesId', undefined);
                }}
                showSearch={suggestOn((text) => {
                  setTypedSeries(text);
                  form.setFieldValue('seriesId', undefined);
                })}
                notFoundContent={pendingOf(series.isFetching)}
                options={seriesOptions(series.items)}
                onSelect={(_title, option) =>
                  form.setFieldValue('seriesId', option.id)
                }
              />
            </Form.Item>
            <Form.Item name="seriesId" hidden noStyle />
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
          {/* One cell per range. Its pickers sit `small` (8px) apart, not
              the Row's 16px gutter: at four columns that leaves a picker too
              narrow for a whole YYYY-MM-DD. The inner items are
              `noStyle`, so the outer one shows their errors under the pair,
              and each picker carries its own name, since the label covers
              both. */}
          <Col {...FIELD_COLUMNS}>
            <Form.Item label="Released">
              <Flex gap="small">
                <Form.Item
                  name="releasedFrom"
                  noStyle
                  dependencies={['releasedTo']}
                  rules={[startsBefore('releasedTo')]}
                >
                  <DatePicker
                    aria-label="Released from"
                    placeholder="From"
                    className={styles.picker}
                    disabledDate={after(releasedTo)}
                  />
                </Form.Item>
                <Form.Item name="releasedTo" noStyle>
                  <DatePicker
                    aria-label="Released to"
                    placeholder="To"
                    className={styles.picker}
                    disabledDate={before(releasedFrom)}
                  />
                </Form.Item>
              </Flex>
            </Form.Item>
          </Col>
          <Col {...FIELD_COLUMNS}>
            <Form.Item label="Updated">
              <Flex gap="small">
                <Form.Item
                  name="updatedFrom"
                  noStyle
                  dependencies={['updatedTo']}
                  rules={[startsBefore('updatedTo')]}
                >
                  <DatePicker
                    aria-label="Updated from"
                    placeholder="From"
                    className={styles.picker}
                    disabledDate={after(updatedTo)}
                  />
                </Form.Item>
                <Form.Item name="updatedTo" noStyle>
                  <DatePicker
                    aria-label="Updated to"
                    placeholder="To"
                    className={styles.picker}
                    disabledDate={before(updatedFrom)}
                  />
                </Form.Item>
              </Flex>
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
