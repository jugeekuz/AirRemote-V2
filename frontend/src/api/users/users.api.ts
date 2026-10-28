import {
  userResponseSchema,
  type RegisterUserRequest,
  type UserResponse,
} from '@airremote/contracts';

import { httpClient } from '@api/http-client';

export const usersApi = {
  /** Creates an account; the caller signs in afterwards. Needs no access token. */
  register(body: RegisterUserRequest): Promise<UserResponse> {
    return httpClient.post('/users/register', body, userResponseSchema, {
      skipAuth: true,
    });
  },
};
