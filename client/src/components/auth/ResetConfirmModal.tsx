import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Result } from 'antd';
import { useNavigate } from 'react-router';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { closeModal, confirmPasswordReset } from '../../store/authSlice';

interface ResetConfirmValues {
  password: string;
  // Client-side only, like RegisterModal's. Never sent.
  confirm: string;
}

export function ResetConfirmModal() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const token = useAppSelector((state) => state.auth.resetToken);
  const [form] = Form.useForm<ResetConfirmValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function dismiss() {
    dispatch(closeModal());
    // replace, so the token is not left sitting in browser history.
    void navigate('/', { replace: true });
  }

  async function handleFinish(values: ResetConfirmValues) {
    if (!token) return;

    setSubmitting(true);
    setFormError(null);

    const result = await dispatch(
      confirmPasswordReset({ token, password: values.password })
    );

    setSubmitting(false);
    if (confirmPasswordReset.rejected.match(result)) {
      // Unknown, expired and already-used tokens all arrive as one 400 with
      // one message; the UI says no more than the server does.
      setFormError(result.payload?.message ?? 'Could not reset the password');
      return;
    }

    setDone(true);
  }

  return (
    <Modal open title="Choose a new password" onCancel={dismiss} footer={null}>
      {!token ? (
        <Result
          status="warning"
          title="This reset link is missing its token."
          subTitle="Request a new link and try again."
        />
      ) : done ? (
        <Result
          status="success"
          title="Your password has been reset."
          subTitle="You have been signed out everywhere. Log in with your new password."
          extra={
            <Button type="primary" onClick={dismiss}>
              Continue
            </Button>
          }
        />
      ) : (
        <>
          {formError !== null && (
            <Alert
              type="error"
              title={formError}
              style={{ marginBottom: 16 }}
            />
          )}

          <Form form={form} layout="vertical" onFinish={handleFinish}>
            <Form.Item
              name="password"
              label="New password"
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
                loading={submitting}
                block
              >
                Set new password
              </Button>
            </Form.Item>
          </Form>
        </>
      )}
    </Modal>
  );
}
