import type { FC } from 'react';
import { useState } from 'react';
import { Alert, Button, Form, Input, Space } from 'antd';
import { useLogin } from '@/queries/auth';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import type { AuthModalProps } from '@/components/organisms/AuthModals/AuthModals';
import spacing from '@/theme/spacing.module.css';

interface LoginValues {
  login: string;
  password: string;
}

export const LoginModal: FC<AuthModalProps> = ({ onOpen, onClose }) => {
  const [form] = Form.useForm<LoginValues>();
  const login = useLogin();
  // `submitting` is gone — the mutation tracks it.
  const [formError, setFormError] = useState<string | null>(null);

  const handleFinish = async (values: LoginValues) => {
    setFormError(null);

    try {
      await login.mutateAsync(values);
      onClose();
    } catch (error) {
      // Form level, never on a field: the server answers an unknown login and
      // a wrong password identically on purpose, and guessing which one was
      // wrong here would undo that anti-enumeration guarantee.
      setFormError(error instanceof Error ? error.message : 'Could not log in');
    }
  };

  return (
    <DiscardGuardModal
      title="Log in"
      onClose={onClose}
      footer={null}
      form={form}
    >
      {formError !== null && (
        <Alert type="error" title={formError} className={spacing.gapBelow} />
      )}

      {/* void: handleFinish reports its own failure in the form, so nothing
          is left for a caller to await. */}
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleFinish(values)}
      >
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
          <Button type="link" onClick={() => onOpen('resetRequest')}>
            Forgot password?
          </Button>
          <Button type="link" onClick={() => onOpen('register')}>
            Create an account
          </Button>
        </Space>
      </Form>
    </DiscardGuardModal>
  );
};
