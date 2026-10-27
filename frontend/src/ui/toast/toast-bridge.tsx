import { useEffect } from 'react';

import { useToast } from '@ui/heroui/components/toast';

import { registerToastSink } from './toast';

/** Connects the imperative `toast` to HeroUI's toast while it is mounted. */
export default function ToastBridge() {
  const { toast } = useToast();

  useEffect(
    () =>
      registerToastSink({
        success: (message) => {
          toast.show({ variant: 'success', label: message });
        },
        error: (message) => {
          toast.show({ variant: 'danger', label: message });
        },
      }),
    [toast],
  );

  return null;
}
