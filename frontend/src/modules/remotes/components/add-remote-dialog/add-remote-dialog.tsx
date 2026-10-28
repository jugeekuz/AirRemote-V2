import { Modal } from '@ui';

import AddRemoteSteps from './add-remote-steps';

type AddRemoteDialogProps = {
  isOpen: boolean;
  onClose: () => void;
};

/**
 * V1's three-step "Add Remote" dialog: the category, the device whose IR
 * transmitter it uses, then the name. Closing it starts it over.
 */
export default function AddRemoteDialog({
  isOpen,
  onClose,
}: AddRemoteDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} placement="top-center">
      <AddRemoteSteps onClose={onClose} />
    </Modal>
  );
}
