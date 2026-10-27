import type { AccessTokenResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { authApi } from '@api/auth';

import {
  useLoginMutation,
  useLogoutMutation,
  useRefreshSessionMutation,
} from './auth.mutations';

jest.mock('@api/auth');

const api = jest.mocked(authApi);
const token: AccessTokenResponse = {
  accessToken: 'abc',
  tokenType: 'Bearer',
  expiresIn: 600,
};

describe('auth mutations', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('logs in with the credentials and exposes the token response', async () => {
    api.login.mockResolvedValueOnce(token);
    const credentials = { email: 'a@b.co', password: 'secret' };

    const { result } = await renderHook(() => useLoginMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(credentials);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.login).toHaveBeenCalledWith(credentials);
    expect(result.current.data).toBe(token);
  });

  it('exposes the ApiError of a rejected login', async () => {
    const apiError: ApiError = {
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid credentials',
      isNetworkError: false,
    };
    api.login.mockRejectedValueOnce(apiError);

    const { result } = await renderHook(() => useLoginMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate({ email: 'a@b.co', password: 'wrong' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(apiError);
  });

  it('refreshes the session with the cookie alone', async () => {
    api.refresh.mockResolvedValueOnce(token);

    const { result } = await renderHook(() => useRefreshSessionMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.refresh).toHaveBeenCalledWith();
    expect(result.current.data).toBe(token);
  });

  it('logs out', async () => {
    api.logout.mockResolvedValueOnce(undefined);

    const { result } = await renderHook(() => useLogoutMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate();

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.logout).toHaveBeenCalledWith();
  });

  it('keys each mutation under auth and silences refresh and logout', async () => {
    api.login.mockResolvedValueOnce(token);
    api.refresh.mockResolvedValueOnce(token);
    api.logout.mockResolvedValueOnce(undefined);
    const queryClient = createTestQueryClient();

    const { result } = await renderHook(
      () => ({
        login: useLoginMutation(),
        refresh: useRefreshSessionMutation(),
        logout: useLogoutMutation(),
      }),
      { wrapper: createQueryWrapper(queryClient) },
    );
    await act(async () => {
      await result.current.login.mutateAsync({
        email: 'a@b.co',
        password: 'x',
      });
      await result.current.refresh.mutateAsync();
      await result.current.logout.mutateAsync();
    });

    const mutations = queryClient
      .getMutationCache()
      .getAll()
      .map(({ options: { mutationKey, meta } }) => ({ mutationKey, meta }));
    expect(mutations).toEqual([
      { mutationKey: ['auth', 'login'], meta: undefined },
      { mutationKey: ['auth', 'refresh'], meta: { silent: true } },
      { mutationKey: ['auth', 'logout'], meta: { silent: true } },
    ]);
  });
});
