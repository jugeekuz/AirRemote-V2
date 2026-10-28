import { createQueryClient } from '@queries/query-client';

import { notifyApiError } from './notify-api-error';

/** The app's one QueryClient; failed requests toast through `notifyApiError`. */
export const queryClient = createQueryClient(notifyApiError);
