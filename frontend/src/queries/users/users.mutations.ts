import { useMutation } from '@tanstack/react-query';

import type { RegisterUserRequest } from '@airremote/contracts';

import { usersApi } from '@api/users';

import { usersKeys } from './users.queries';

/**
 * Creates an account. Like the auth mutations it runs even while offline
 * (`networkMode: 'always'`), so Sign up fails fast with `NETWORK_ERROR`
 * instead of spinning until the device is back online. Its errors
 * (`EMAIL_TAKEN`, ...) are shown by the query client.
 */
export function useRegisterMutation() {
  return useMutation({
    mutationKey: [...usersKeys.all, 'register'],
    networkMode: 'always',
    mutationFn: (body: RegisterUserRequest) => usersApi.register(body),
  });
}
