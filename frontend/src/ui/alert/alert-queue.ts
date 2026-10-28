import type { AlertRequest } from './alert';

/** A request waiting in the bridge, with an id to key its dialog by. */
export type QueuedAlert = { id: number; request: AlertRequest };

/**
 * Adds a request to the end of the queue. An error whose message is already
 * waiting is not added again: several queries failing for one reason (the
 * network is down) show one dialog, as V1's did.
 */
export function enqueueAlert(
  queue: readonly QueuedAlert[],
  next: QueuedAlert,
): readonly QueuedAlert[] {
  const { request } = next;
  if (
    request.kind === 'error' &&
    queue.some(
      (queued) =>
        queued.request.kind === 'error' &&
        queued.request.message === request.message,
    )
  ) {
    return queue;
  }
  return [...queue, next];
}
