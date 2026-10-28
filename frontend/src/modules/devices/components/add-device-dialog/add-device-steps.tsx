import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { PairingDetails } from '@app-types';
import { useEnrollDeviceMutation } from '@queries/devices';
import {
  formatMacAddress,
  formatPairingCode,
  getPairingDetails,
  isValidDeviceName,
} from '@modules/devices/helpers/pairing';
import { Modal } from '@ui';

import AddDeviceCode from './add-device-code';
import {
  ADD_DEVICE_STEP,
  type AddDeviceStep,
} from './add-device-dialog.constants';
import AddDeviceInstructions from './add-device-instructions';
import AddDeviceName from './add-device-name';

type AddDeviceStepsProps = {
  pairing: PairingDetails | null;
  onClose: () => void;
};

/** The steps' content and buttons; mounted while the dialog is open. */
export default function AddDeviceSteps({
  pairing: linkPairing,
  onClose,
}: AddDeviceStepsProps) {
  const { t } = useTranslation('devices');
  const [step, setStep] = useState<AddDeviceStep>(
    linkPairing ? ADD_DEVICE_STEP.NAME : ADD_DEVICE_STEP.INSTRUCTIONS,
  );
  // Both kept as shown: `AA:BB:CC:DD:EE:01` and `7K4M-Q9TX`.
  const [macAddress, setMacAddress] = useState(
    formatMacAddress(linkPairing?.macAddress ?? ''),
  );
  const [pairingCode, setPairingCode] = useState(
    formatPairingCode(linkPairing?.pairingCode ?? ''),
  );
  const [isManual, setIsManual] = useState(false);
  const [name, setName] = useState('');
  const { mutate: enroll, isPending: isEnrolling } = useEnrollDeviceMutation();
  const pairing = getPairingDetails(macAddress, pairingCode);
  const canFinish = !!pairing && isValidDeviceName(name) && !isEnrolling;

  const handleScanned = (scanned: PairingDetails) => {
    setMacAddress(formatMacAddress(scanned.macAddress));
    setPairingCode(formatPairingCode(scanned.pairingCode));
    setStep(ADD_DEVICE_STEP.NAME);
  };

  // Errors (a wrong or expired code, a board already enrolled) open the
  // Error dialog; the steps stay, so the user can go back to the code.
  const finish = () => {
    if (!pairing || !canFinish) {
      return;
    }
    enroll({ ...pairing, name: name.trim() }, { onSuccess: onClose });
  };

  return (
    <>
      <Modal.Header>{t('add-device.title')}</Modal.Header>
      <Modal.Body>
        {step === ADD_DEVICE_STEP.INSTRUCTIONS && <AddDeviceInstructions />}
        {step === ADD_DEVICE_STEP.CODE && (
          <AddDeviceCode
            macAddress={macAddress}
            pairingCode={pairingCode}
            isManual={isManual}
            onChangeMacAddress={(text) => setMacAddress(formatMacAddress(text))}
            onChangePairingCode={(text) =>
              setPairingCode(formatPairingCode(text))
            }
            onChangeManual={setIsManual}
            onScanned={handleScanned}
          />
        )}
        {step === ADD_DEVICE_STEP.NAME && !!pairing && (
          <AddDeviceName
            pairing={pairing}
            name={name}
            onChangeName={setName}
            onSubmit={finish}
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Modal.Button variant="danger-light" onPress={onClose}>
          {t('close', { ns: 'actions' })}
        </Modal.Button>
        {step !== ADD_DEVICE_STEP.INSTRUCTIONS && (
          <Modal.Button
            variant="secondary"
            onPress={() =>
              setStep(
                step === ADD_DEVICE_STEP.NAME
                  ? ADD_DEVICE_STEP.CODE
                  : ADD_DEVICE_STEP.INSTRUCTIONS,
              )
            }
          >
            {t('back', { ns: 'actions' })}
          </Modal.Button>
        )}
        {step === ADD_DEVICE_STEP.NAME ? (
          <Modal.Button
            variant="primary"
            onPress={finish}
            isDisabled={!canFinish}
          >
            {t('finish', { ns: 'actions' })}
          </Modal.Button>
        ) : (
          <Modal.Button
            variant="primary"
            onPress={() =>
              setStep(
                step === ADD_DEVICE_STEP.INSTRUCTIONS
                  ? ADD_DEVICE_STEP.CODE
                  : ADD_DEVICE_STEP.NAME,
              )
            }
            isDisabled={step === ADD_DEVICE_STEP.CODE && !pairing}
          >
            {t('next', { ns: 'actions' })}
          </Modal.Button>
        )}
      </Modal.Footer>
    </>
  );
}
