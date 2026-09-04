import type { FC } from 'react';
import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Space, theme } from 'antd';
import { useAppDispatch } from '@/store/hooks';
import { closeModal, openModal } from '@/store/authSlice';
import { useLogin } from '@/queries/auth';

interface LoginValues {
  login: string;
  password: string;
}

export const LoginModal: FC = () => {
  const { token } = theme.useToken();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm<LoginValues>();
  const login = useLogin();
  // `submitting` is gone — the mutation tracks it.
  const [formError, setFormError] = useState<string | null>(null);

  async function handleFinish(values: LoginValues) {
    setFormError(null);

    try {
      await login.mutateAsync(values);
      // The reducer no longer sees the API result, so the modal closes itself.
      dispatch(closeModal());
    } catch (error) {
      // Form level, never on a field: the server answers an unknown login and
      // a wrong password identically on purpose, and guessing which one was
      // wrong here would undo that anti-enumeration guarantee.
      setFormError(error instanceof Error ? error.message : 'Could not log in');
    }
  }

  return (
    <Modal
      open
      title="Log in"
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
          rules={[{ required: true, message: 'Enter your login' }]}
        >
          <Input autoComplete="username" />
        </Form.Item>

        <Form.Item
          name="password"
          label="Password"
          rules={[{ required: true, message: 'Enter your password' }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>

        <Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={login.isPending}
            block
          >
            Log in
          </Button>
        </Form.Item>

        <Space>
          <Button
            type="link"
            onClick={() => dispatch(openModal('resetRequest'))}
          >
            Forgot password?
          </Button>
          <Button type="link" onClick={() => dispatch(openModal('register'))}>
            Create an account
          </Button>
        </Space>
      </Form>
    </Modal>
  );
};
