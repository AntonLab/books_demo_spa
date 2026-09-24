import type { FC } from 'react';
import { Form, Input } from 'antd';

interface Props {
  label: string;
}

// A password and its confirmation, for any form that sets one. Fills the
// `password` and `confirm` fields of the Form around it; `confirm` is
// client-side only and never sent.
export const NewPasswordFields: FC<Props> = ({ label }) => (
  <>
    <Form.Item
      name="password"
      label={label}
      rules={[
        { required: true, message: 'Enter a password' },
        { min: 8, max: 128, message: 'Password must be 8 to 128 characters' },
      ]}
    >
      <Input.Password autoComplete="new-password" />
    </Form.Item>

    <Form.Item
      name="confirm"
      label="Confirm password"
      dependencies={['password']}
      rules={[
        { required: true, message: 'Repeat the password' },
        ({ getFieldValue }) => ({
          validator: (_rule, value: string) =>
            !value || getFieldValue('password') === value
              ? Promise.resolve()
              : Promise.reject(new Error('The two passwords do not match')),
        }),
      ]}
    >
      <Input.Password autoComplete="new-password" />
    </Form.Item>
  </>
);
