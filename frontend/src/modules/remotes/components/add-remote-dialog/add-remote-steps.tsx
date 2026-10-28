import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import type { RemoteType } from '@airremote/contracts';

import { deviceQueries } from '@queries/devices';
import { useCreateRemoteMutation } from '@queries/remotes';
import {
  getRemoteDevice,
  isValidRemoteName,
} from '@modules/remotes/helpers/remotes';
import { Modal } from '@ui';

import AddRemoteDevice from './add-remote-device';
import {
  ADD_REMOTE_STEP,
  type AddRemoteStep,
} from './add-remote-dialog.constants';
import AddRemoteName from './add-remote-name';
import AddRemoteType from './add-remote-type';

type AddRemoteStepsProps = {
  onClose: () => void;
};

const NO_DEVICES = Object.freeze([]);

/** The steps' content and buttons; mounted while the dialog is open. */
export default function AddRemoteSteps({ onClose }: AddRemoteStepsProps) {
  const { t } = useTranslation('remotes');
  const [step, setStep] = useState<AddRemoteStep>(ADD_REMOTE_STEP.TYPE);
  const [type, setType] = useState<RemoteType | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const { data: devices } = useQuery(deviceQueries.list());
  const { mutate: create, isPending: isCreating } = useCreateRemoteMutation();
  // Gone if the device was deleted meanwhile.
  const device = deviceId
    ? getRemoteDevice({ deviceId }, devices ?? NO_DEVICES)
    : undefined;
  const canCreate =
    !!type && !!device && isValidRemoteName(name) && !isCreating;
  const canGoNext = step === ADD_REMOTE_STEP.TYPE ? !!type : !!device;

  const goNext = () => {
    setStep(
      step === ADD_REMOTE_STEP.TYPE
        ? ADD_REMOTE_STEP.DEVICE
        : ADD_REMOTE_STEP.NAME,
    );
  };

  const goBack = () => {
    setStep(
      step === ADD_REMOTE_STEP.NAME
        ? ADD_REMOTE_STEP.DEVICE
        : ADD_REMOTE_STEP.TYPE,
    );
  };

  // Errors (a name the device already has, a device deleted meanwhile)
  // open the Error dialog; the steps stay, so the user can fix the name.
  const createRemote = () => {
    if (!type || !device || !canCreate) {
      return;
    }
    create(
      { deviceId: device.id, body: { name: name.trim(), type } },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <Modal.Header>{t('add-remote.title')}</Modal.Header>
      <Modal.Body>
        {step === ADD_REMOTE_STEP.TYPE && (
          <AddRemoteType type={type} onChangeType={setType} />
        )}
        {step === ADD_REMOTE_STEP.DEVICE && (
          <AddRemoteDevice
            devices={devices ?? NO_DEVICES}
            isLoaded={devices !== undefined}
            deviceId={deviceId}
            onChangeDevice={setDeviceId}
          />
        )}
        {step === ADD_REMOTE_STEP.NAME && (
          <AddRemoteName
            name={name}
            onChangeName={setName}
            onSubmit={createRemote}
          />
        )}
      </Modal.Body>
      <Modal.Footer>
        <Modal.Button variant="danger-light" onPress={onClose}>
          {t('close', { ns: 'actions' })}
        </Modal.Button>
        {step !== ADD_REMOTE_STEP.TYPE && (
          <Modal.Button variant="secondary" onPress={goBack}>
            {t('back', { ns: 'actions' })}
          </Modal.Button>
        )}
        {step === ADD_REMOTE_STEP.NAME ? (
          <Modal.Button
            variant="primary"
            onPress={createRemote}
            isDisabled={!canCreate}
          >
            {t('create', { ns: 'actions' })}
          </Modal.Button>
        ) : (
          <Modal.Button
            variant="primary"
            onPress={goNext}
            isDisabled={!canGoNext}
          >
            {t('next', { ns: 'actions' })}
          </Modal.Button>
        )}
      </Modal.Footer>
    </>
  );
}
