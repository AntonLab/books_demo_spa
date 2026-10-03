import type { FC } from 'react';
import { Alert, Button, Form, Input, Radio, Space } from 'antd';
import { REPORT_EXPLANATION_MAX_LENGTH, REPORT_REASONS } from 'shared';
import type { ReportPayload, ReportReason } from 'shared';
import { DiscardGuardModal } from '@/components/molecules/DiscardGuardModal/DiscardGuardModal';
import { REASON_LABELS } from '@/types/report';

interface ReportCommentModalProps {
  onSubmit: (payload: ReportPayload) => void;
  onCancel: () => void;
  pending: boolean;
  error: string | null;
}

interface FieldValues {
  reason?: ReportReason;
  explanation?: string;
}

export const ReportCommentModal: FC<ReportCommentModalProps> = ({
  onSubmit,
  onCancel,
  pending,
  error,
}) => {
  const [form] = Form.useForm<FieldValues>();
  const watched = Form.useWatch([], form) as FieldValues | undefined;
  const reason = watched?.reason;
  const explanation = (watched?.explanation ?? '').trim();
  const canSend =
    reason !== undefined && (reason !== 'other' || explanation !== '');

  const handleFinish = () => {
    if (reason === undefined) return;
    onSubmit(reason === 'other' ? { reason, explanation } : { reason });
  };

  return (
    <DiscardGuardModal
      title="Report comment"
      form={form}
      onClose={onCancel}
      footer={(_, { CancelBtn }) => (
        <Space>
          <CancelBtn />
          <Button
            type="primary"
            loading={pending}
            disabled={!canSend || pending}
            onClick={() => form.submit()}
          >
            Send report
          </Button>
        </Space>
      )}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="reason" label="Reason">
          <Radio.Group
            options={REPORT_REASONS.map((value) => ({
              value,
              label: REASON_LABELS[value],
            }))}
          />
        </Form.Item>
        {reason === 'other' && (
          <Form.Item name="explanation" label="Explanation">
            <Input.TextArea maxLength={REPORT_EXPLANATION_MAX_LENGTH} />
          </Form.Item>
        )}
        {error !== null && (
          <Alert type="error" title={error} style={{ marginBottom: 16 }} />
        )}
      </Form>
    </DiscardGuardModal>
  );
};
