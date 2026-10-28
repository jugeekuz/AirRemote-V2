import { onlineManager } from '@tanstack/react-query';

import type { RegisterUserRequest, UserResponse } from '@airremote/contracts';

import type { ApiError } from '@app-types';
import {
  act,
  createQueryWrapper,
  createTestQueryClient,
  renderHook,
  waitFor,
} from '@utils/tests';
import { usersApi } from '@api/users';

import { useRegisterMutation } from './users.mutations';
import { usersKeys } from './users.queries';

jest.mock('@api/users');

const api = jest.mocked(usersApi);
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

beforeEach(() => {
  jest.resetAllMocks();
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('usersKeys', () => {
  it('nests every key under the domain', () => {
    expect(usersKeys.all).toEqual(['users']);
  });
});

describe('useRegisterMutation', () => {
  it('registers with the request body and exposes the new user', async () => {
    api.register.mockResolvedValueOnce(user);

    const { result } = await renderHook(() => useRegisterMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(body);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(api.register).toHaveBeenCalledWith(body);
    expect(result.current.data).toBe(user);
  });

  it('is keyed under users and shows its errors', async () => {
    api.register.mockResolvedValueOnce(user);
    const queryClient = createTestQueryClient();

    const { result } = await renderHook(() => useRegisterMutation(), {
      wrapper: createQueryWrapper(queryClient),
    });
    await act(async () => {
      await result.current.mutateAsync(body);
    });

    const [mutation] = queryClient.getMutationCache().getAll();
    expect(mutation?.options.mutationKey).toEqual(['users', 'register']);
    expect(mutation?.options.meta).toBeUndefined();
  });

  it('exposes the ApiError of a rejected registration', async () => {
    const apiError: ApiError = {
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email taken',
      isNetworkError: false,
    };
    api.register.mockRejectedValueOnce(apiError);

    const { result } = await renderHook(() => useRegisterMutation(), {
      wrapper: createQueryWrapper(),
    });
    result.current.mutate(body);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error).toBe(apiError);
  });

  // Like the auth mutations: paused offline, the button would spin forever.
  it('fails fast while offline instead of pausing', async () => {
    onlineManager.setOnline(false);
    const unreachable: ApiError = {
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    };
    api.register.mockRejectedValueOnce(unreachable);

    const { result } = await renderHook(() => useRegisterMutation(), {
      wrapper: createQueryWrapper(),
    });

    await act(async () => {
      await expect(result.current.mutateAsync(body)).rejects.toBe(unreachable);
    });
  });
});
