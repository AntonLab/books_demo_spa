import type { FC } from 'react';
import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Result, theme } from 'antd';
import { useAppDispatch } from '@/store/hooks';
import { closeModal, openModal } from '@/store/authSlice';
import { useRequestReset } from '@/queries/auth';

interface ResetRequestValues {
  email: string;
}

// One message for every address. The server answers 202 whether or not the
// account exists; branching here would put back the enumeration oracle it
// refuses to be.
const CONFIRMATION =
  'If that email address has an account, a reset link is on its way.';

export const ResetRequestModal: FC = () => {
  const { token } = theme.useToken();
  const dispatch = useAppDispatch();
  const [form] = Form.useForm<ResetRequestValues>();
  const requestReset = useRequestReset();
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleFinish = async (values: ResetRequestValues) => {
    setFormError(null);

    try {
      await requestReset.mutateAsync(values.email);
      setSent(true);
    } catch (error) {
      // Only a malformed request or a dead server reaches here.
      setFormError(
        error instanceof Error ? error.message : 'Could not send the reset link'
      );
    }
  };

  return (
    <Modal
      open
      title="Reset your password"
      onCancel={() => dispatch(closeModal())}
      footer={null}
    >
      {sent ? (
        <Result status="success" title={CONFIRMATION} />
      ) : (
        <>
          {formError !== null && (
            <Alert
              type="error"
              title={formError}
              style={{ marginBottom: token.margin }}
            />
          )}

          <Form form={form} layout="vertical" onFinish={handleFinish}>
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

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={requestReset.isPending}
                block
              >
                Send reset link
              </Button>
            </Form.Item>

            <Button type="link" onClick={() => dispatch(openModal('login'))}>
              Back to log in
            </Button>
          </Form>
        </>
      )}
    </Modal>
  );
};
