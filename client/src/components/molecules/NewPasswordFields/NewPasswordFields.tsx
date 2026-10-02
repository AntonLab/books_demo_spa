import type { FC } from 'react';
import { Form, Input } from 'antd';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from 'shared';

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
        {
          min: PASSWORD_MIN_LENGTH,
          max: PASSWORD_MAX_LENGTH,
          message: `Password must be ${PASSWORD_MIN_LENGTH} to ${PASSWORD_MAX_LENGTH} characters`,
        },
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
