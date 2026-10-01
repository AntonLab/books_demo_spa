import { Modal } from 'antd';
import type { FormInstance, ModalProps } from 'antd';
import type { FC } from 'react';

interface DiscardGuardModalProps extends Omit<ModalProps, 'open' | 'onCancel'> {
  // Optional because isFieldsTouched on a form no <Form> has mounted logs an
  // unconnected-form warning: callers pass it only while the Form is on screen,
  // and the modal then closes at once.
  form?: FormInstance;
  onClose: () => void;
}

export const DiscardGuardModal: FC<DiscardGuardModalProps> = ({
  form,
  onClose,
  ...rest
}) => {
  const [modal, contextHolder] = Modal.useModal();

  const handleCancel = () => {
    if (form?.isFieldsTouched()) {
      modal.confirm({
        title: 'Discard changes?',
        okText: 'Discard',
        cancelText: 'Keep editing',
        okButtonProps: { danger: true },
        onOk: onClose,
      });
      return;
    }
    onClose();
  };

  return (
    <>
      <Modal {...rest} open onCancel={handleCancel} />
      {contextHolder}
    </>
  );
};
