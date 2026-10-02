import type { FC } from 'react';
import { useState } from 'react';
import { Alert, App, Button, Form, Input } from 'antd';
import {
  EMAIL_MAX_LENGTH,
  LOGIN_MAX_LENGTH,
  LOGIN_MIN_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
} from 'shared';
import { useUpdateAccount } from '@/queries/users';
import type { AccountChanges } from '@/api/users';
import { accountFieldErrors } from '@/types/accountErrors';
import type { PublicUser } from '@/types/api';
import spacing from '@/theme/spacing.module.css';

const FIELDS = ['login', 'email', 'firstName', 'lastName'] as const;

type AccountValues = Pick<PublicUser, (typeof FIELDS)[number]> & {
  currentPassword?: string;
};

const pickFields = (user: PublicUser): AccountValues => ({
  login: user.login,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
});

export const AccountDetailsForm: FC<{ user: PublicUser }> = ({ user }) => {
  const [form] = Form.useForm<AccountValues>();
  const { message } = App.useApp();
  const updateAccount = useUpdateAccount(user.id);
  const [formError, setFormError] = useState<string | null>(null);
  // The baseline every diff compares against: the last saved values, which
  // lead the session refetch.
  const [saved, setSaved] = useState(() => pickFields(user));
  const values = Form.useWatch([], form);

  const changes: AccountChanges = {};
  for (const name of FIELDS) {
    const value = values?.[name];
    if (value !== undefined && value !== saved[name]) {
      changes[name] = value;
    }
  }
  const hasChanges = Object.keys(changes).length > 0;
  const emailChanged = 'email' in changes;

  const handleFinish = async (formValues: AccountValues) => {
    setFormError(null);

    try {
      const result = await updateAccount.mutateAsync(
        emailChanged
          ? { ...changes, currentPassword: formValues.currentPassword }
          : changes
      );
      void message.success('Account updated.');
      setSaved(pickFields(result));
      form.setFieldsValue({ ...pickFields(result), currentPassword: '' });
    } catch (error) {
      const fieldErrors = accountFieldErrors(error);
      if (fieldErrors) {
        // accountFieldErrors names fields as plain strings, which the form's
        // typed NamePath cannot tell from its own keys.
        form.setFields(fieldErrors as Parameters<typeof form.setFields>[0]);
        return;
      }
      setFormError(
        error instanceof Error ? error.message : 'Could not save the account'
      );
    }
  };

  return (
    <>
      {formError !== null && (
        <Alert type="error" title={formError} className={spacing.gapBelow} />
      )}

      {/* void: handleFinish reports its own failure in the form. */}
      <Form
        form={form}
        layout="vertical"
        initialValues={pickFields(user)}
        onFinish={(formValues) => void handleFinish(formValues)}
      >
        <Form.Item
          name="login"
          label="Login"
          rules={[
            { required: true, message: 'Enter a login' },
            {
              min: LOGIN_MIN_LENGTH,
              max: LOGIN_MAX_LENGTH,
              message: `Login must be ${LOGIN_MIN_LENGTH} to ${LOGIN_MAX_LENGTH} characters`,
            },
          ]}
        >
          <Input autoComplete="username" />
        </Form.Item>

        <Form.Item
          name="firstName"
          label="First name"
          rules={[
            { required: true, message: 'Enter your first name' },
            {
              max: NAME_MAX_LENGTH,
              message: `First name must be at most ${NAME_MAX_LENGTH} characters`,
            },
          ]}
        >
          <Input autoComplete="given-name" />
        </Form.Item>

        <Form.Item
          name="lastName"
          label="Last name"
          rules={[
            { required: true, message: 'Enter your last name' },
            {
              max: NAME_MAX_LENGTH,
              message: `Last name must be at most ${NAME_MAX_LENGTH} characters`,
            },
          ]}
        >
          <Input autoComplete="family-name" />
        </Form.Item>

        <Form.Item
          name="email"
          label="Email"
          rules={[
            { required: true, message: 'Enter an email address' },
            { type: 'email', message: 'Enter a valid email address' },
            {
              max: EMAIL_MAX_LENGTH,
              message: `Email must be at most ${EMAIL_MAX_LENGTH} characters`,
            },
          ]}
        >
          <Input autoComplete="email" />
        </Form.Item>

        {emailChanged && (
          <Form.Item
            name="currentPassword"
            preserve={false}
            label="Current password"
            rules={[
              { required: true, message: 'Enter your current password' },
              { max: PASSWORD_MAX_LENGTH },
            ]}
          >
            <Input.Password autoComplete="current-password" />
          </Form.Item>
        )}

        <Button
          type="primary"
          htmlType="submit"
          disabled={!hasChanges}
          loading={updateAccount.isPending}
        >
          Save
        </Button>
      </Form>
    </>
  );
};
