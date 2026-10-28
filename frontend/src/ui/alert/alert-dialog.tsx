import { useTranslation } from 'react-i18next';

import { Modal } from '@ui/modal';

import type { AlertRequest } from './alert';

type AlertDialogProps = {
  request: AlertRequest;
  /** The dialog was answered: `true` for OK or the confirm button. */
  onSettle: (confirmed: boolean) => void;
};

/**
 * V1's ModalError ("Error", the message, a black OK) and TileDelete's
 * confirmation (title, message, black Yes then dark grey No), at the top.
 */
export default function AlertDialog({ request, onSettle }: AlertDialogProps) {
  const { t } = useTranslation();
  const dismiss = () => {
    onSettle(false);
  };

  if (request.kind === 'error') {
    return (
      <Modal isOpen onClose={dismiss} placement="top">
        <Modal.Header hasTopMargin>{t('alert.error-title')}</Modal.Header>
        <Modal.Body>
          <Modal.Text>{request.message}</Modal.Text>
        </Modal.Body>
        <Modal.Footer>
          <Modal.Button variant="primary" onPress={() => onSettle(true)}>
            {t('ok', { ns: 'actions' })}
          </Modal.Button>
        </Modal.Footer>
      </Modal>
    );
  }

  const { title, message, confirmLabel, cancelLabel } = request.options;
  return (
    <Modal isOpen onClose={dismiss} placement="top">
      <Modal.Header hasTopMargin>{title}</Modal.Header>
      <Modal.Body>
        <Modal.Text>{message}</Modal.Text>
      </Modal.Body>
      <Modal.Footer>
        <Modal.Button variant="primary" onPress={() => onSettle(true)}>
          {confirmLabel}
        </Modal.Button>
        <Modal.Button variant="secondary" onPress={dismiss}>
          {cancelLabel}
        </Modal.Button>
      </Modal.Footer>
    </Modal>
  );
}
