import { enqueueAlert, type QueuedAlert } from './alert-queue';

const error = (id: number, message: string): QueuedAlert => ({
  id,
  request: { kind: 'error', message },
});

const confirm = (id: number): QueuedAlert => ({
  id,
  request: {
    kind: 'confirm',
    options: {
      title: 'Confirmation',
      message: 'Sure?',
      confirmLabel: 'Yes',
      cancelLabel: 'No',
    },
    resolve: jest.fn(),
  },
});

describe('enqueueAlert', () => {
  it('adds a request to the end', () => {
    const first = error(1, 'A');
    const second = error(2, 'B');

    expect(enqueueAlert([first], second)).toEqual([first, second]);
  });

  it('skips an error whose message is already waiting', () => {
    const queue = [error(1, 'Offline'), confirm(2)];

    expect(enqueueAlert(queue, error(3, 'Offline'))).toBe(queue);
  });

  it('always adds a confirmation', () => {
    const queue = [confirm(1)];

    expect(enqueueAlert(queue, confirm(2))).toHaveLength(2);
  });
});
