import type { FC } from 'react';
import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Result } from 'antd';
import { useRequestReset } from '@/queries/auth';
import type { AuthModalProps } from '@/components/organisms/AuthModals/AuthModals';
import styles from './ResetRequestModal.module.css';

interface ResetRequestValues {
  email: string;
}

// One message for every address. The server answers 202 whether or not the
// account exists; branching here would put back the enumeration oracle it
// refuses to be.
const CONFIRMATION =
  'If that email address has an account, a reset link is on its way.';

export const ResetRequestModal: FC<AuthModalProps> = ({ onOpen, onClose }) => {
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
    <Modal open title="Reset your password" onCancel={onClose} footer={null}>
      {sent ? (
        <Result status="success" title={CONFIRMATION} />
      ) : (
        <>
          {formError !== null && (
            <Alert type="error" title={formError} className={styles.error} />
          )}

          {/* void: handleFinish reports its own failure in the form, so nothing
              is left for a caller to await. */}
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => void handleFinish(values)}
          >
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

            <Button type="link" onClick={() => onOpen('login')}>
              Back to log in
            </Button>
          </Form>
        </>
      )}
    </Modal>
  );
};
