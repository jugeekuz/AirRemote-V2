import { useEffect, useRef, useState } from 'react';

import { registerAlertSink } from './alert';
import AlertDialog from './alert-dialog';
import { enqueueAlert, type QueuedAlert } from './alert-queue';

const EMPTY_QUEUE: readonly QueuedAlert[] = [];

/**
 * Connects the imperative `alert` to V1's dialogs while it is mounted. It
 * shows the first request and keeps the rest waiting; answering one shows
 * the next. Confirmations still waiting when it unmounts resolve `false`.
 */
export default function AlertBridge() {
  const [queue, setQueue] = useState(EMPTY_QUEUE);
  // What is still waiting when the bridge unmounts.
  const queueRef = useRef(queue);
  const nextId = useRef(0);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    const unregister = registerAlertSink((request) => {
      nextId.current += 1;
      const queued = { id: nextId.current, request };
      setQueue((current) => enqueueAlert(current, queued));
    });
    return () => {
      unregister();
      for (const { request } of queueRef.current) {
        if (request.kind === 'confirm') {
          request.resolve(false);
        }
      }
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
    setQueue((waiting) => waiting.filter(({ id }) => id !== current.id));
  };

  // Keyed by request, so each dialog opens afresh instead of swapping text.
  return (
    <AlertDialog key={current.id} request={current.request} onSettle={settle} />
  );
}
