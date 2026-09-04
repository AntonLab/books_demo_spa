import type { FC } from 'react';
import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, theme } from 'antd';
import { useAppDispatch } from '@/store/hooks';
import { closeModal, openModal } from '@/store/authSlice';
import { useRegister } from '@/queries/auth';
import { ApiError } from '@/api/client';

interface RegisterValues {
  login: string;
  email: string;
  password: string;
  // Client-side only. Never sent: the server has no such field and zod would
  // strip it, so a body carrying it would disagree with its own schema.
  confirm: string;
  firstName: string;
  lastName: string;
}

// The server already worked out which column collided and returns it as
// `details.field`; this narrows that `unknown` back to a form field name.
function conflictField(details: unknown): 'login' | 'email' | null {
  if (typeof details !== 'object' || details === null) {
    return null;
  }
  const { field } = details as { field?: unknown };
  return field === 'login' || field === 'email' ? field : null;
}

export const RegisterModal: FC = () => {
  const { token } = theme.useToken();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm<RegisterValues>();
  const register = useRegister();
  const [formError, setFormError] = useState<string | null>(null);

  async function handleFinish(values: RegisterValues) {
    setFormError(null);

    try {
      await register.mutateAsync({
        login: values.login,
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });
      // The reducer no longer sees the API result, so the modal closes itself.
      dispatch(closeModal());
    } catch (error) {
      // The ApiError arrives intact, so `details` can be narrowed straight off
      // it — no AuthFailure in between.
      if (error instanceof ApiError) {
        const field = conflictField(error.details);
        if (error.status === 409 && field) {
          form.setFields([{ name: field, errors: [error.message] }]);
          return;
        }
      }

      setFormError(
        error instanceof Error ? error.message : 'Could not register'
      );
    }
  }

  return (
    <Modal
      open
      title="Create an account"
      onCancel={() => dispatch(closeModal())}
      footer={null}
    >
      {formError !== null && (
        <Alert
          type="error"
          title={formError}
          style={{ marginBottom: token.margin }}
        />
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="login"
          label="Login"
          rules={[
            { required: true, message: 'Enter a login' },
            { min: 3, max: 64, message: 'Login must be 3 to 64 characters' },
          ]}
        >
          <Input autoComplete="username" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Enter an email address' },
            { type: 'email', message: 'Enter a valid email address' },
            { max: 255, message: 'Email must be at most 255 characters' },
          ]}
        >
          <Input autoComplete="email" />
        </Form.Item>

        <Form.Item
          name="firstName"
          label="First name"
          rules={[
            { required: true, message: 'Enter your first name' },
            { max: 64, message: 'First name must be at most 64 characters' },
          ]}
        >
          <Input autoComplete="given-name" />
        </Form.Item>

        <Form.Item
          name="lastName"
          label="Last name"
          rules={[
            { required: true, message: 'Enter your last name' },
            { max: 64, message: 'Last name must be at most 64 characters' },
          ]}
        >
          <Input autoComplete="family-name" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[
            { required: true, message: 'Enter a password' },
            {
              min: 8,
              max: 128,
              message: 'Password must be 8 to 128 characters',
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
              validator(_rule, value: string) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(
                  new Error('The two passwords do not match')
                );
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={register.isPending}
            block
          >
            Register
          </Button>
        </Form.Item>

        <Button type="link" onClick={() => dispatch(openModal('login'))}>
          Already have an account?
        </Button>
      </Form>
    </Modal>
  );
};
