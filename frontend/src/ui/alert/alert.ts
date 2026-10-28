/** The texts of a confirmation dialog; the caller translates them. */
export type ConfirmOptions = {
  title: string;
  message: string;
  /** The black button on the left (V1's "Yes"). */
  confirmLabel: string;
  /** The dark grey button on the right (V1's "No"). */
  cancelLabel: string;
};

/** What `alert` asks the mounted `AlertBridge` to show. */
export type AlertRequest =
  | { kind: 'error'; message: string }
  | {
      kind: 'confirm';
      options: ConfirmOptions;
      resolve: (confirmed: boolean) => void;
    };

export type AlertSink = (request: AlertRequest) => void;

let sink: AlertSink | null = null;

/**
 * Connects `alert` to a sink. Returns the function that disconnects it; it
 * only disconnects if that sink is still the current one.
 */
export function registerAlertSink(next: AlertSink): () => void {
  sink = next;
  return () => {
    if (sink === next) {
      sink = null;
    }
  };
}

/**
 * V1's dialogs, opened from anywhere (the query cache, a delete badge). One
 * dialog shows at a time; the others wait their turn. Without a mounted
 * `UiProvider` an error is dropped and a confirmation resolves `false`.
 */
export const alert = {
  /** The "Error" dialog with the message and an OK button. */
  error(message: string): void {
    sink?.({ kind: 'error', message });
  },
  /** A confirmation; resolves `true` only on the confirm button. */
  confirm(options: ConfirmOptions): Promise<boolean> {
    const current = sink;
    if (!current) {
      return Promise.resolve(false);
    }
    return new Promise((resolve) => {
      current({ kind: 'confirm', options, resolve });
    });
  },
};
