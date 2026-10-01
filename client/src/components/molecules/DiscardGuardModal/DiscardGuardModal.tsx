import { Modal } from 'antd';
import type { FormInstance, ModalProps } from 'antd';
import { useRef } from 'react';
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

  // Escape or the close icon pressed again while the confirm is open would
  // stack another one; afterClose covers Discard, Keep editing and Escape alike.
  const confirmOpen = useRef(false);

  const handleCancel = () => {
    if (form?.isFieldsTouched()) {
      if (confirmOpen.current) return;
      confirmOpen.current = true;
      modal.confirm({
        afterClose: () => {
          confirmOpen.current = false;
        },
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
