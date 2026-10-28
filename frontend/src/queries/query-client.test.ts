import type { QueryClient } from '@tanstack/react-query';

import type { ApiError } from '@app-types';

import { createQueryClient } from './query-client';

function apiError(overrides: Partial<ApiError> = {}): ApiError {
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Something went wrong',
    isNetworkError: false,
    ...overrides,
  };
}

const clients: QueryClient[] = [];

// The default gcTime is minutes long. Clearing drops the query timers, and
// mutations get no timer at all, or Jest would wait for them to exit.
afterEach(() => {
  clients.splice(0).forEach((client) => {
    client.clear();
  });
});

function setup() {
  const onApiError = jest.fn();
  const client = createQueryClient(onApiError);
  const defaults = client.getDefaultOptions();
  client.setDefaultOptions({
    ...defaults,
    mutations: { ...defaults.mutations, gcTime: Infinity },
  });
  clients.push(client);
  // Keep the retry tests fast: the default delay backs off for seconds.
  client.setQueryDefaults(['test'], { retryDelay: 0 });
  return { client, onApiError };
}

describe('createQueryClient', () => {
  it('reports a failed query with its meta.errorMessage', async () => {
    const { client, onApiError } = setup();
    const error = apiError({ status: 500, code: 'INTERNAL_ERROR' });

    await expect(
      client.fetchQuery({
        queryKey: ['test', 'reported'],
        queryFn: () => Promise.reject(error),
        meta: { errorMessage: 'Could not load' },
        retry: false,
      }),
    ).rejects.toBe(error);

    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(onApiError).toHaveBeenCalledWith(error, 'Could not load');
  });

  it('reports a failed first load, which has no data to show', async () => {
    const { client, onApiError } = setup();
    const error = apiError({ code: 'NETWORK_ERROR', isNetworkError: true });

    await expect(
      client.fetchQuery({
        queryKey: ['test', 'first-load'],
        queryFn: () => Promise.reject(error),
        retry: false,
      }),
    ).rejects.toBe(error);

    expect(onApiError).toHaveBeenCalledWith(error, undefined);
  });

  // Polling (the device list every 30 s) would otherwise open the Error
  // dialog on every tick while offline; the screen keeps its last data.
  it('does not report a failed refetch of a query that has data', async () => {
    const { client, onApiError } = setup();
    client.setQueryData(['test', 'refetch'], ['cached']);

    await expect(
      client.fetchQuery({
        queryKey: ['test', 'refetch'],
        queryFn: () => Promise.reject(apiError({ code: 'NETWORK_ERROR' })),
        staleTime: 0,
        retry: false,
      }),
    ).rejects.toBeDefined();

    expect(onApiError).not.toHaveBeenCalled();
    expect(client.getQueryData(['test', 'refetch'])).toEqual(['cached']);
  });

  it('does not report a silent query', async () => {
    const { client, onApiError } = setup();

    await expect(
      client.fetchQuery({
        queryKey: ['test', 'silent'],
        queryFn: () => Promise.reject(apiError()),
        meta: { silent: true },
        retry: false,
      }),
    ).rejects.toBeDefined();

    expect(onApiError).not.toHaveBeenCalled();
  });

  it('reports a failed mutation', async () => {
    const { client, onApiError } = setup();
    const error = apiError({ status: 401, code: 'INVALID_CREDENTIALS' });

    await expect(
      client
        .getMutationCache()
        .build(client, {
          mutationFn: () => Promise.reject(error),
          meta: { errorMessage: 'Could not sign in' },
        })
        .execute(undefined),
    ).rejects.toBe(error);

    expect(onApiError).toHaveBeenCalledTimes(1);
    expect(onApiError).toHaveBeenCalledWith(error, 'Could not sign in');
  });

  it('does not report a silent mutation', async () => {
    const { client, onApiError } = setup();

    await expect(
      client
        .getMutationCache()
        .build(client, {
          mutationFn: () => Promise.reject(apiError()),
          meta: { silent: true },
        })
        .execute(undefined),
    ).rejects.toBeDefined();

    expect(onApiError).not.toHaveBeenCalled();
  });

  it('does not report a cancelled request', async () => {
    const { client, onApiError } = setup();
    const cancelled = apiError({
      code: 'REQUEST_CANCELLED',
      message: 'Request cancelled',
    });

    await expect(
      client.fetchQuery({
        queryKey: ['test', 'cancelled-query'],
        queryFn: () => Promise.reject(cancelled),
      }),
    ).rejects.toBe(cancelled);
    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn: () => Promise.reject(cancelled) })
        .execute(undefined),
    ).rejects.toBe(cancelled);

    expect(onApiError).not.toHaveBeenCalled();
  });

  it('does not retry a 4xx', async () => {
    const { client } = setup();
    const queryFn = jest
      .fn()
      .mockRejectedValue(apiError({ status: 404, code: 'NOT_FOUND' }));

    await expect(
      client.fetchQuery({ queryKey: ['test', '4xx'], queryFn }),
    ).rejects.toBeDefined();

    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it.each(['INVALID_RESPONSE', 'REQUEST_CANCELLED'] as const)(
    'does not retry %s',
    async (code) => {
      const { client } = setup();
      const queryFn = jest.fn().mockRejectedValue(apiError({ code }));

      await expect(
        client.fetchQuery({ queryKey: ['test', code], queryFn }),
      ).rejects.toBeDefined();

      expect(queryFn).toHaveBeenCalledTimes(1);
    },
  );

  it('retries a network error twice', async () => {
    const { client } = setup();
    const queryFn = jest.fn().mockRejectedValue(
      apiError({
        code: 'NETWORK_ERROR',
        isNetworkError: true,
      }),
    );

    await expect(
      client.fetchQuery({ queryKey: ['test', 'network'], queryFn }),
    ).rejects.toBeDefined();

    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it('never retries a mutation', async () => {
    const { client } = setup();
    const mutationFn = jest.fn().mockRejectedValue(apiError());

    await expect(
      client
        .getMutationCache()
        .build(client, { mutationFn })
        .execute(undefined),
    ).rejects.toBeDefined();

    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});
