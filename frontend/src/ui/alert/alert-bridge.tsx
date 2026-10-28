import { useEffect, useRef, useState } from 'react';

import { registerAlertSink } from './alert';
import AlertDialog from './alert-dialog';
import { enqueueAlert, type QueuedAlert } from './alert-queue';

const EMPTY_QUEUE: readonly QueuedAlert[] = [];

/** Confirmations nobody will answer any more resolve `false`. */
function answerNo(queue: readonly QueuedAlert[]): void {
  for (const { request } of queue) {
    if (request.kind === 'confirm') {
      request.resolve(false);
    }
  }
}

/**
 * Connects the imperative `alert` to V1's dialogs while it is mounted. It
 * shows the first request and keeps the rest waiting; answering one shows
 * the next. Confirmations still waiting when it unmounts, or when
 * `alert.dismissAll` drops them, resolve `false`.
 */
export default function AlertBridge() {
  const [queue, setQueue] = useState(EMPTY_QUEUE);
  // The queue as the sink and the unmount see it, ahead of any render.
  const queueRef = useRef(queue);
  const nextId = useRef(0);

  useEffect(() => {
    // The ref is updated at once, so a dismissal in the same moment as a
    // request (before the queue renders) still sees that request.
    const unregister = registerAlertSink({
      show: (request) => {
        nextId.current += 1;
        const queued = { id: nextId.current, request };
        queueRef.current = enqueueAlert(queueRef.current, queued);
        setQueue(queueRef.current);
      },
      dismissAll: () => {
        const dismissed = queueRef.current;
        queueRef.current = EMPTY_QUEUE;
        setQueue(EMPTY_QUEUE);
        answerNo(dismissed);
      },
    });
    return () => {
      unregister();
      answerNo(queueRef.current);
    };
  }, []);

  const current = queue[0];
  if (!current) {
    return null;
  }

  const settle = (confirmed: boolean) => {
    if (current.request.kind === 'confirm') {
      current.request.resolve(confirmed);
    }
    queueRef.current = queueRef.current.filter(({ id }) => id !== current.id);
    setQueue(queueRef.current);
  };

  // Keyed by request, so each dialog opens afresh instead of swapping text.
  return (
    <AlertDialog key={current.id} request={current.request} onSettle={settle} />
  );
}
