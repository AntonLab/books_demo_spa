import type { FC } from 'react';
import { useState } from 'react';
import { Alert, App, Button, Form, Input, Typography } from 'antd';
import { PASSWORD_MAX_LENGTH } from 'shared';
import { NewPasswordFields } from '@/components/molecules/NewPasswordFields/NewPasswordFields';
import { useChangePassword } from '@/queries/auth';
import { ApiError } from '@/api/client';
import { accountFieldErrors } from '@/types/accountErrors';
import spacing from '@/theme/spacing.module.css';

interface PasswordValues {
  currentPassword: string;
  password: string;
  confirm: string;
}

export const ChangePasswordForm: FC<{ userId: number }> = ({ userId }) => {
  const [form] = Form.useForm<PasswordValues>();
  const { message } = App.useApp();
  const changePassword = useChangePassword(userId);
  const [formError, setFormError] = useState<string | null>(null);

  const handleFinish = async (values: PasswordValues) => {
    setFormError(null);

    try {
      await changePassword.mutateAsync({
        password: values.password,
        currentPassword: values.currentPassword,
      });
      // An antd message outlives the unmount that the cleared session causes.
      void message.success('Password changed. Sign in with your new password.');
    } catch (error) {
      const fieldErrors = accountFieldErrors<PasswordValues>(error);
      if (fieldErrors) {
        form.setFields(fieldErrors);
        if (error instanceof ApiError && error.status === 403) {
          form.resetFields(['password', 'confirm']);
        }
        return;
      }
      setFormError(
        error instanceof Error ? error.message : 'Could not change the password'
      );
    }
  };

  return (
    <section>
      <Typography.Title level={5}>Change password</Typography.Title>

      {formError !== null && (
        <Alert type="error" title={formError} className={spacing.gapBelow} />
      )}

      {/* void: handleFinish reports its own failure in the form. */}
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleFinish(values)}
      >
        <Form.Item
          name="currentPassword"
          label="Current password"
          rules={[
            { required: true, message: 'Enter your current password' },
            { max: PASSWORD_MAX_LENGTH },
          ]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>

        <NewPasswordFields label="New password" />

        <Button
          type="primary"
          htmlType="submit"
          loading={changePassword.isPending}
        >
          Change password
        </Button>
      </Form>
    </section>
  );
};
