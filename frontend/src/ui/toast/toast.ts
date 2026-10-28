/** Where `toast` sends messages: the mounted `ToastBridge`. */
export type ToastSink = {
  success(message: string): void;
  error(message: string): void;
};

let sink: ToastSink | null = null;

/**
 * Connects `toast` to a sink. Returns the function that disconnects it; it
 * only disconnects if that sink is still the current one.
 */
export function registerToastSink(next: ToastSink): () => void {
  sink = next;
  return () => {
    if (sink === next) {
      sink = null;
    }
  };
}

/**
 * Shows toasts from outside React (e.g. the query cache). Without a mounted
 * `UiProvider` the message is dropped.
 */
export const toast: ToastSink = {
  success(message) {
    sink?.success(message);
  },
  error(message) {
    sink?.error(message);
  },
};
