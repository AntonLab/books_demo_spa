import type { FC } from 'react';
import { useState } from 'react';
import { Alert, Button, Form, Modal, Result } from 'antd';
import { useNavigate } from 'react-router';
import { NewPasswordFields } from '@/components/molecules/NewPasswordFields/NewPasswordFields';
import { useConfirmReset } from '@/queries/auth';
import spacing from '@/theme/spacing.module.css';

interface ResetConfirmValues {
  password: string;
  // Client-side only, like RegisterModal's. Never sent.
  confirm: string;
}

interface Props {
  token: string;
}

export const ResetConfirmModal: FC<Props> = ({ token }) => {
  const navigate = useNavigate();
  const [form] = Form.useForm<ResetConfirmValues>();
  const confirmReset = useConfirmReset();
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The token in the URL is what keeps this modal open, so leaving the page
  // closes it. replace, so the token is not left sitting in browser history.
  const dismiss = () => void navigate('/', { replace: true });

  const handleFinish = async (values: ResetConfirmValues) => {
    setFormError(null);

    try {
      await confirmReset.mutateAsync({ token, password: values.password });
      setDone(true);
    } catch (error) {
      // Unknown, expired and already-used tokens all arrive as one 400 with
      // one message; the UI says no more than the server does.
      setFormError(
        error instanceof Error ? error.message : 'Could not reset the password'
      );
    }
  };

  return (
    <Modal open title="Choose a new password" onCancel={dismiss} footer={null}>
      {done ? (
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
              className={spacing.gapBelow}
            />
          )}

          {/* void: handleFinish reports its own failure in the form, so nothing
              is left for a caller to await. */}
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => void handleFinish(values)}
          >
            <NewPasswordFields label="New password" />

            <Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                loading={confirmReset.isPending}
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
};
