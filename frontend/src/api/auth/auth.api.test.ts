import { accessTokenResponseSchema } from '@airremote/contracts';

import { httpClient, noContentSchema } from '@api/http-client';

import { authApi } from './auth.api';

jest.mock('@api/http-client', () => ({
  httpClient: { post: jest.fn() },
  noContentSchema: { kind: 'noContentSchema' },
}));

const post = jest.mocked(httpClient.post);
const token = { accessToken: 'abc', tokenType: 'Bearer', expiresIn: 600 };
const cookieCall = { skipAuth: true, withCredentials: true };

describe('authApi', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('logs in with the credentials and returns the access token', async () => {
    post.mockResolvedValueOnce(token);
    const body = { email: 'a@b.co', password: 'secret' };

    await expect(authApi.login(body)).resolves.toBe(token);
    expect(post).toHaveBeenCalledWith(
      '/auth/login',
      body,
      accessTokenResponseSchema,
      cookieCall,
    );
  });

  it('refreshes with the cookie alone and returns the access token', async () => {
    post.mockResolvedValueOnce(token);

    await expect(authApi.refresh()).resolves.toBe(token);
    expect(post).toHaveBeenCalledWith(
      '/auth/refresh',
      undefined,
      accessTokenResponseSchema,
      cookieCall,
    );
  });

  it('logs out, expecting no content', async () => {
    post.mockResolvedValueOnce(undefined);

    await expect(authApi.logout()).resolves.toBeUndefined();
    expect(post).toHaveBeenCalledWith(
      '/auth/logout',
      undefined,
      noContentSchema,
      cookieCall,
    );
  });

  it('passes the client rejection through', async () => {
    const apiError = {
      status: 401,
      code: 'INVALID_REFRESH_TOKEN',
      message: 'Invalid refresh token',
      isNetworkError: false,
    };
    post.mockRejectedValueOnce(apiError);

    await expect(authApi.refresh()).rejects.toBe(apiError);
  });
});
