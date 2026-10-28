import { useState } from 'react';

import { Modal } from '@ui';

import LearnButtonSteps from './learn-button-steps';

type LearnButtonDialogProps = {
  isOpen: boolean;
  /** The remote the new button belongs to. */
  remoteId: string;
  onClose: () => void;
};

/**
 * V1's "Add Button" dialog without its "does your remote have a screen?"
 * step (V2 keeps no button state): the name, V1's instructions, then the
 * device listening. Closing it starts it over; while the device listens
 * the backdrop doesn't close it, so the result is never missed.
 */
export default function LearnButtonDialog({
  isOpen,
  remoteId,
  onClose,
}: LearnButtonDialogProps) {
  const [isListening, setIsListening] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isListening) {
          onClose();
        }
      }}
      placement="top-center"
    >
      <LearnButtonSteps
        remoteId={remoteId}
        onClose={onClose}
        onListeningChange={setIsListening}
      />
    </Modal>
  );
}
