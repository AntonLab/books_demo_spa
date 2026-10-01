import type { FC, ReactNode } from 'react';
import { Form, Input, Select } from 'antd';
import { WORK_DESCRIPTION_MAX_LENGTH, WORK_TITLE_MAX_LENGTH } from 'shared';
import type { PublicGenre } from 'shared';

interface Props {
  genreOptions: PublicGenre[];
  // Fields of one kind of work only, placed between the tags and the Genre.
  children?: ReactNode;
}

// The fields a Book and a Series share: title, description, tags and Genre.
// Fills the `title`, `description`, `tags` and `genreId` fields of the Form
// around it.
export const WorkFields: FC<Props> = ({ genreOptions, children }) => (
  <>
    <Form.Item
      name="title"
      label="Title"
      rules={[{ required: true, whitespace: true, message: 'Enter a title' }]}
    >
      <Input maxLength={WORK_TITLE_MAX_LENGTH} />
    </Form.Item>

    <Form.Item
      name="description"
      label="Description"
      rules={[
        { required: true, whitespace: true, message: 'Enter a description' },
      ]}
    >
      <Input.TextArea rows={4} maxLength={WORK_DESCRIPTION_MAX_LENGTH} />
    </Form.Item>

    <Form.Item name="tags" label="Tags">
      <Select mode="tags" aria-label="Tags" tokenSeparators={[',']} />
    </Form.Item>

    {children}

    <Form.Item name="genreId" label="Genre">
      <Select
        aria-label="Genre"
        allowClear
        placeholder="No genre"
        options={genreOptions.map((genre) => ({
          value: genre.id,
          label: genre.name,
        }))}
      />
    </Form.Item>
  </>
);
