import type { PairingDetails } from '@app-types';
import { Modal } from '@ui';

import AddDeviceSteps from './add-device-steps';

type AddDeviceDialogProps = {
  isOpen: boolean;
  /** From a pairing link: the dialog starts at the name, filled in. */
  pairing: PairingDetails | null;
  onClose: () => void;
};

/**
 * V1's three-step "Add device" dialog, for V2's pairing codes: how to get a
 * code, then the code (scanned or typed), then the name. Closing it starts
 * it over; another pairing link starts it over with that pairing.
 */
export default function AddDeviceDialog({
  isOpen,
  pairing,
  onClose,
}: AddDeviceDialogProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} placement="top-center">
      <AddDeviceSteps
        key={pairing ? `${pairing.macAddress}/${pairing.pairingCode}` : 'new'}
        pairing={pairing}
        onClose={onClose}
      />
    </Modal>
  );
}
