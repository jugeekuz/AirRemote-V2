import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { UiProvider } from '@ui/ui-provider';

import Modal from './modal';

describe('Modal', () => {
  it('shows its title, text and buttons while open', async () => {
    const onClose = jest.fn();
    const onNext = jest.fn();
    await render(
      <UiProvider>
        <Modal isOpen onClose={onClose}>
          <Modal.Header>Add device</Modal.Header>
          <Modal.Body>
            <Modal.Text>Steps to connecting your device</Modal.Text>
          </Modal.Body>
          <Modal.Footer>
            <Modal.Button variant="danger-light" onPress={onClose}>
              Close
            </Modal.Button>
            <Modal.Button variant="primary" onPress={onNext}>
              Next
            </Modal.Button>
          </Modal.Footer>
        </Modal>
      </UiProvider>,
    );

    expect(
      screen.getByRole('heading', { name: 'Add device' }),
    ).toBeOnTheScreen();
    expect(
      screen.getByText('Steps to connecting your device'),
    ).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    });
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows nothing while closed', async () => {
    await render(
      <UiProvider>
        <Modal isOpen={false} onClose={jest.fn()}>
          <Modal.Header>Add device</Modal.Header>
        </Modal>
      </UiProvider>,
    );

    expect(screen.queryByText('Add device')).not.toBeOnTheScreen();
  });

  it('does not press a disabled button', async () => {
    const onNext = jest.fn();
    await render(
      <UiProvider>
        <Modal isOpen onClose={jest.fn()}>
          <Modal.Footer>
            <Modal.Button variant="primary" onPress={onNext} isDisabled>
              Next
            </Modal.Button>
          </Modal.Footer>
        </Modal>
      </UiProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Next' }));
    });

    expect(onNext).not.toHaveBeenCalled();
  });
});
