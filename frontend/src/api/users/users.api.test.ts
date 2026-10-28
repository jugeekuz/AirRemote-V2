import {
  userResponseSchema,
  type RegisterUserRequest,
  type UserResponse,
} from '@airremote/contracts';

import { httpClient } from '@api/http-client';

import { usersApi } from './users.api';

jest.mock('@api/http-client', () => ({
  httpClient: { post: jest.fn() },
}));

const post = jest.mocked(httpClient.post);
const body: RegisterUserRequest = {
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: 'password123',
};
const user: UserResponse = {
  id: '6f1c0d4e-9a43-4c1b-8d4e-2f0a1b2c3d4e',
  email: 'ada@example.com',
  firstName: 'Ada',
  lastName: 'Lovelace',
  createdAt: '2026-10-28T10:00:00.000Z',
};

describe('usersApi', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('registers without an access token and returns the new user', async () => {
    post.mockResolvedValueOnce(user);

    await expect(usersApi.register(body)).resolves.toBe(user);
    expect(post).toHaveBeenCalledWith(
      '/users/register',
      body,
      userResponseSchema,
      { skipAuth: true },
    );
  });

  it('passes the client rejection through', async () => {
    const apiError = {
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email taken',
      isNetworkError: false,
    };
    post.mockRejectedValueOnce(apiError);

    await expect(usersApi.register(body)).rejects.toBe(apiError);
  });
});
