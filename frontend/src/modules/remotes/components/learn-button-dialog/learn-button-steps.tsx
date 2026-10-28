import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isValidButtonName } from '@modules/remotes/helpers/buttons';
import { useLearnButton } from '@modules/remotes/hooks';
import { Modal } from '@ui';

import {
  LEARN_BUTTON_STEP,
  type LearnButtonStep,
} from './learn-button-dialog.constants';
import LearnButtonInstructions from './learn-button-instructions';
import LearnButtonListening from './learn-button-listening';
import LearnButtonName from './learn-button-name';

type LearnButtonStepsProps = {
  remoteId: string;
  onClose: () => void;
  /** Whether the device is listening, so the dialog can't be dismissed. */
  onListeningChange: (isListening: boolean) => void;
};

/** The steps' content and buttons; mounted while the dialog is open. */
export default function LearnButtonSteps({
  remoteId,
  onClose,
  onListeningChange,
}: LearnButtonStepsProps) {
  const { t } = useTranslation('remotes');
  const [step, setStep] = useState<LearnButtonStep>(LEARN_BUTTON_STEP.NAME);
  const [name, setName] = useState('');
  const isNameValid = isValidButtonName(name);
  // A name the remote already has: the Error dialog says so, and the user
  // gets to change it.
  const backToName = useCallback(() => {
    setStep(LEARN_BUTTON_STEP.NAME);
  }, []);
  const { isListening, learn } = useLearnButton(remoteId, {
    onDone: onClose,
    onNameTaken: backToName,
  });

  useEffect(() => {
    onListeningChange(isListening);
  }, [isListening, onListeningChange]);
  useEffect(
    () => () => {
      onListeningChange(false);
    },
    [onListeningChange],
  );

  const goToInstructions = () => {
    if (isNameValid) {
      setStep(LEARN_BUTTON_STEP.INSTRUCTIONS);
    }
  };

  const startListening = () => {
    setStep(LEARN_BUTTON_STEP.LISTENING);
    learn(name.trim());
  };

  return (
    <>
      <Modal.Header>{t('learn-button.title')}</Modal.Header>
      <Modal.Body>
        {step === LEARN_BUTTON_STEP.NAME && (
          <LearnButtonName
            name={name}
            onChangeName={setName}
            onSubmit={goToInstructions}
          />
        )}
        {step === LEARN_BUTTON_STEP.INSTRUCTIONS && <LearnButtonInstructions />}
        {step === LEARN_BUTTON_STEP.LISTENING && <LearnButtonListening />}
      </Modal.Body>
      {/* V1's last step had no footer: the device decides when it ends. */}
      {step !== LEARN_BUTTON_STEP.LISTENING && (
        <Modal.Footer>
          <Modal.Button variant="danger-light" onPress={onClose}>
            {t('close', { ns: 'actions' })}
          </Modal.Button>
          {step === LEARN_BUTTON_STEP.INSTRUCTIONS && (
            <Modal.Button variant="secondary" onPress={backToName}>
              {t('back', { ns: 'actions' })}
            </Modal.Button>
          )}
          <Modal.Button
            variant="primary"
            onPress={
              step === LEARN_BUTTON_STEP.NAME
                ? goToInstructions
                : startListening
            }
            isDisabled={!isNameValid}
          >
            {t('next', { ns: 'actions' })}
          </Modal.Button>
        </Modal.Footer>
      )}
    </>
  );
}
