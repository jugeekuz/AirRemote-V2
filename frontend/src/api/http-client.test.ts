import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { z } from 'zod';

import type { ApiError } from '@app-types';

import {
  createHttpClient,
  noContentSchema,
  type HttpClientHooks,
} from './http-client';

type Answer = (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>;

/**
 * Answers one request with this status and body, the way axios' `settle`
 * does: a response below 400, an `AxiosError` carrying it from 400 up.
 */
function respond(status: number, data?: unknown): Answer {
  return async (config) => {
    const response: AxiosResponse = {
      status,
      statusText: '',
      headers: {},
      config,
      data,
    };
    if (status >= 400) {
      throw new AxiosError(
        `Request failed with status code ${status}`,
        AxiosError.ERR_BAD_REQUEST,
        config,
        {},
        response,
      );
    }
    return response;
  };
}

const unauthorized = (message = 'Invalid access token') => ({
  error: { code: 'UNAUTHORIZED', message },
});

/** A promise settled from outside, to hold a refresh or an answer open. */
function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

/** Lets every pending promise callback run. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

const idSchema = z.object({ id: z.string() });

const invalidRefreshToken: ApiError = {
  status: 401,
  code: 'INVALID_REFRESH_TOKEN',
  message: 'Invalid refresh token',
  isNetworkError: false,
};

function setup(initialToken: string | null = 'old') {
  // Each test queues its answers with mockImplementationOnce.
  const adapter = jest.fn<Promise<AxiosResponse>, [InternalAxiosRequestConfig]>(
    () => Promise.reject(new Error('No answer queued')),
  );
  // The hooks behave like the auth store: a refresh stores its token, and
  // ending the session clears it.
  const session = { token: initialToken };
  const hooks = {
    getAccessToken: jest.fn<string | null, []>(() => session.token),
    refreshAccessToken: jest.fn<Promise<string>, []>(),
    onSessionExpired: jest.fn<void, []>(() => {
      session.token = null;
    }),
  } satisfies HttpClientHooks;
  const client = createHttpClient({ baseURL: 'https://api.test', adapter });
  client.configure(hooks);

  /** The next refresh stores and resolves this token. */
  const refreshTo = (token: string) =>
    hooks.refreshAccessToken.mockImplementationOnce(async () => {
      session.token = token;
      return token;
    });

  /** Holds the next refresh open; resolve it with the new token, or reject it. */
  const holdRefresh = () => {
    const refresh = deferred<string>();
    hooks.refreshAccessToken.mockImplementationOnce(async () => {
      const token = await refresh.promise;
      session.token = token;
      return token;
    });
    return refresh;
  };

  /** The Authorization header the nth request (0-based) went out with. */
  const sentAuthorization = (call: number) =>
    adapter.mock.calls[call]?.[0].headers.get('Authorization');

  return {
    adapter,
    hooks,
    session,
    client,
    refreshTo,
    holdRefresh,
    sentAuthorization,
  };
}

/**
 * A server that accepts only `validToken`. A request to `heldUrl` that is not
 * a retry waits for `gate`, so its 401 arrives late.
 */
function server(
  validToken: string | null,
  { heldUrl, gate }: { heldUrl?: string; gate?: Promise<void> } = {},
): Answer {
  return async (config) => {
    if (config.url === heldUrl && !config.retried) {
      await gate;
    }
    const accepted =
      validToken !== null &&
      config.headers.get('Authorization') === `Bearer ${validToken}`;
    return accepted
      ? respond(200, { id: 'a' })(config)
      : respond(401, unauthorized(`Refused ${config.url}`))(config);
  };
}

describe('createHttpClient', () => {
  it('resolves with the body parsed by the schema', async () => {
    const { adapter, client } = setup();
    adapter.mockImplementationOnce(respond(200, { id: 'a', extra: 1 }));

    await expect(client.get('/things/a', idSchema)).resolves.toEqual({
      id: 'a',
    });
    expect(adapter.mock.calls[0]?.[0]).toMatchObject({
      baseURL: 'https://api.test',
      url: '/things/a',
      method: 'get',
    });
  });

  it('sends the body and method of each verb', async () => {
    const { adapter, client } = setup();
    adapter.mockImplementation(respond(200, { id: 'a' }));

    await client.post('/things', { name: 'x' }, idSchema);
    await client.put('/things/a', { name: 'y' }, idSchema);
    await client.patch('/things/a', { name: 'z' }, idSchema);
    await client.delete('/things/a', idSchema);

    const sent = adapter.mock.calls.map(([config]) => [
      config.method,
      config.url,
      config.data,
    ]);
    expect(sent).toEqual([
      ['post', '/things', '{"name":"x"}'],
      ['put', '/things/a', '{"name":"y"}'],
      ['patch', '/things/a', '{"name":"z"}'],
      ['delete', '/things/a', undefined],
    ]);
  });

  it('passes the request options a call may set', async () => {
    const { adapter, client } = setup();
    adapter.mockImplementationOnce(respond(200, { id: 'a' }));
    const controller = new AbortController();

    await client.get('/things', idSchema, {
      signal: controller.signal,
      withCredentials: true,
      params: { page: 2 },
    });

    expect(adapter.mock.calls[0]?.[0]).toMatchObject({
      signal: controller.signal,
      withCredentials: true,
      params: { page: 2 },
    });
  });

  it('ignores axios options a call may not set', async () => {
    const { adapter, client, sentAuthorization } = setup('old');
    adapter.mockImplementationOnce(respond(200, { id: 'a' }));
    const options = { retried: true, baseURL: 'https://evil.test' };

    // @ts-expect-error `retried` and `baseURL` belong to the client.
    await client.get('/things', idSchema, options);

    expect(adapter.mock.calls[0]?.[0].baseURL).toBe('https://api.test');
    expect(sentAuthorization(0)).toBe('Bearer old');
  });

  it('rejects with INVALID_RESPONSE when the body fails the schema', async () => {
    const { adapter, client } = setup();
    adapter.mockImplementationOnce(respond(200, {}));

    await expect(client.get('/things/a', idSchema)).rejects.toMatchObject({
      status: 200,
      code: 'INVALID_RESPONSE',
      details: [expect.objectContaining({ path: 'id' })],
      isNetworkError: false,
    });
  });

  it('rejects with the server error as an ApiError', async () => {
    const { adapter, client } = setup();
    adapter.mockImplementationOnce(
      respond(409, { error: { code: 'EMAIL_TAKEN', message: 'Email taken' } }),
    );

    await expect(client.post('/users', {}, idSchema)).rejects.toEqual({
      status: 409,
      code: 'EMAIL_TAKEN',
      message: 'Email taken',
      isNetworkError: false,
    });
  });

  it('sends the access token as a Bearer header', async () => {
    const { adapter, client, sentAuthorization } = setup('old');
    adapter.mockImplementationOnce(respond(200, { id: 'a' }));

    await client.get('/things/a', idSchema);

    expect(sentAuthorization(0)).toBe('Bearer old');
  });

  it('sends no Authorization header when skipAuth is set or there is no token', async () => {
    const withToken = setup('old');
    withToken.adapter.mockImplementationOnce(respond(200, { id: 'a' }));
    await withToken.client.post('/auth/login', {}, idSchema, {
      skipAuth: true,
    });
    expect(withToken.sentAuthorization(0)).toBeUndefined();

    const withoutToken = setup(null);
    withoutToken.adapter.mockImplementationOnce(respond(200, { id: 'a' }));
    await withoutToken.client.get('/things/a', idSchema);
    expect(withoutToken.sentAuthorization(0)).toBeUndefined();
  });

  it('behaves as signed out until configured', async () => {
    const adapter = jest.fn(respond(401, unauthorized()));
    const client = createHttpClient({ baseURL: 'https://api.test', adapter });

    await expect(client.get('/things/a', idSchema)).rejects.toMatchObject({
      status: 401,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(adapter.mock.calls[0]?.[0].headers.get('Authorization')).toBe(
      undefined,
    );
  });

  it('refreshes on a 401 and retries once with the new token', async () => {
    const { adapter, hooks, client, refreshTo, sentAuthorization } =
      setup('old');
    adapter
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(200, { id: 'a' }));
    refreshTo('new');

    await expect(client.get('/things/a', idSchema)).resolves.toEqual({
      id: 'a',
    });

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(sentAuthorization(0)).toBe('Bearer old');
    expect(sentAuthorization(1)).toBe('Bearer new');
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
  });

  it('retries a post with the same body', async () => {
    const { adapter, client, refreshTo } = setup('old');
    adapter
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(200, { id: 'a' }));
    refreshTo('new');

    await client.post('/things', { name: 'x' }, idSchema);

    expect(adapter.mock.calls[1]?.[0]).toMatchObject({
      method: 'post',
      url: '/things',
      data: '{"name":"x"}',
    });
  });

  it('retries with the token the refresh resolved, not a re-read one', async () => {
    const { adapter, hooks, session, client, sentAuthorization } = setup('old');
    adapter
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(200, { id: 'a' }));
    // After the refresh the store says 'stale'; the retry still sends 'new'.
    hooks.refreshAccessToken.mockImplementationOnce(async () => {
      session.token = 'stale';
      return 'new';
    });

    await client.get('/things/a', idSchema);

    expect(sentAuthorization(1)).toBe('Bearer new');
  });

  it('refreshes once for concurrent 401s', async () => {
    const { adapter, hooks, client, holdRefresh, sentAuthorization } =
      setup('old');
    adapter
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(200, { id: 'a' }))
      .mockImplementationOnce(respond(200, { id: 'a' }));
    const refresh = holdRefresh();

    const first = client.get('/things/a', idSchema);
    const second = client.get('/things/a', idSchema);
    await settle();
    refresh.resolve('new');

    await expect(first).resolves.toEqual({ id: 'a' });
    await expect(second).resolves.toEqual({ id: 'a' });
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(sentAuthorization(2)).toBe('Bearer new');
    expect(sentAuthorization(3)).toBe('Bearer new');
  });

  it('ends the session once when the refresh is refused with a 401', async () => {
    const { adapter, hooks, client, holdRefresh } = setup('old');
    // Each request gets its own 401, so each rejection can be told apart.
    adapter.mockImplementation(server(null));
    const refresh = holdRefresh();

    const first = client.get('/a', idSchema);
    const second = client.get('/b', idSchema);
    await settle();
    refresh.reject(invalidRefreshToken);

    await expect(first).rejects.toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Refused /a',
      isNetworkError: false,
    });
    await expect(second).rejects.toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Refused /b',
      isNetworkError: false,
    });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(hooks.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it.each<[string, ApiError]>([
    [
      'offline',
      {
        code: 'NETWORK_ERROR',
        message: 'Network Error',
        isNetworkError: true,
      },
    ],
    [
      'a 5xx',
      {
        status: 503,
        code: 'INTERNAL_ERROR',
        message: 'Unavailable',
        isNetworkError: false,
      },
    ],
    [
      'a malformed body',
      {
        status: 200,
        code: 'INVALID_RESPONSE',
        message: 'Bad shape',
        isNetworkError: false,
      },
    ],
  ])(
    'keeps the session and rejects every waiter with the refresh error (%s)',
    async (_reason, failure) => {
      const { adapter, hooks, session, client, holdRefresh } = setup('old');
      adapter.mockImplementation(server(null));
      const refresh = holdRefresh();

      const first = client.get('/a', idSchema);
      const second = client.get('/b', idSchema);
      await settle();
      refresh.reject(failure);

      await expect(first).rejects.toEqual(failure);
      await expect(second).rejects.toEqual(failure);
      expect(adapter).toHaveBeenCalledTimes(2);
      expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
      expect(hooks.onSessionExpired).not.toHaveBeenCalled();
      expect(session.token).toBe('old');
    },
  );

  it('keeps the session and rejects with the original 401 when the refresh fails with a non-ApiError', async () => {
    const { adapter, hooks, session, client, holdRefresh } = setup('old');
    adapter.mockImplementation(server(null));
    const refresh = holdRefresh();

    const first = client.get('/a', idSchema);
    const second = client.get('/b', idSchema);
    await settle();
    refresh.reject(new Error('Signed out while refreshing'));

    await expect(first).rejects.toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Refused /a',
      isNetworkError: false,
    });
    await expect(second).rejects.toEqual({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Refused /b',
      isNetworkError: false,
    });
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
    expect(session.token).toBe('old');
  });

  it('refreshes again on the next 401 after a transient failure', async () => {
    const { adapter, hooks, client, refreshTo } = setup('old');
    adapter.mockImplementation(server('new'));
    hooks.refreshAccessToken.mockRejectedValueOnce({
      code: 'NETWORK_ERROR',
      message: 'Network Error',
      isNetworkError: true,
    });

    await expect(client.get('/a', idSchema)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    refreshTo('new');

    await expect(client.get('/a', idSchema)).resolves.toEqual({ id: 'a' });
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(2);
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
  });

  it('retries a late 401 with the token refreshed meanwhile', async () => {
    const { adapter, hooks, client, refreshTo } = setup('old');
    const gate = deferred<void>();
    adapter.mockImplementation(
      server('new', { heldUrl: '/b', gate: gate.promise }),
    );
    refreshTo('new');

    // Both go out with 'old'; /a's 401 refreshes, /b's 401 comes after.
    const first = client.get('/a', idSchema);
    const second = client.get('/b', idSchema);
    await expect(first).resolves.toEqual({ id: 'a' });
    gate.resolve();

    await expect(second).resolves.toEqual({ id: 'a' });
    const sentToB = adapter.mock.calls
      .filter(([config]) => config.url === '/b')
      .map(([config]) => config.headers.get('Authorization'));
    expect(sentToB).toEqual(['Bearer old', 'Bearer new']);
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not refresh a late 401 after the session ended', async () => {
    const { adapter, hooks, client } = setup('old');
    const gate = deferred<void>();
    adapter.mockImplementation(
      server(null, { heldUrl: '/b', gate: gate.promise }),
    );
    hooks.refreshAccessToken.mockRejectedValue(invalidRefreshToken);

    const first = client.get('/a', idSchema);
    const second = client.get('/b', idSchema);
    await expect(first).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    gate.resolve();

    await expect(second).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Refused /b',
    });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(hooks.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('starts a new refresh after the previous one settled', async () => {
    const { adapter, hooks, client, refreshTo } = setup('old');
    adapter
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(200, { id: 'a' }))
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(200, { id: 'a' }));
    refreshTo('new');
    refreshTo('newer');

    await client.get('/things/a', idSchema);
    await client.get('/things/a', idSchema);

    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(2);
  });

  it('does not refresh again when the retried request gets a 401', async () => {
    const { adapter, hooks, client, refreshTo } = setup('old');
    adapter
      .mockImplementationOnce(respond(401, unauthorized()))
      .mockImplementationOnce(respond(401, unauthorized('Still refused')));
    refreshTo('new');

    await expect(client.get('/things/a', idSchema)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Still refused',
    });
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(hooks.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('ends the session once when every retry is refused', async () => {
    const { adapter, hooks, client, holdRefresh } = setup('old');
    adapter.mockImplementation(server(null));
    const refresh = holdRefresh();

    const requests = ['/a', '/b', '/c'].map((url) => client.get(url, idSchema));
    await settle();
    refresh.resolve('new');

    const results = await Promise.allSettled(requests);
    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'rejected',
      'rejected',
    ]);
    expect(adapter).toHaveBeenCalledTimes(6);
    expect(hooks.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(hooks.onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it('never refreshes a skipAuth request', async () => {
    const { adapter, hooks, client } = setup('old');
    adapter.mockImplementationOnce(
      respond(401, {
        error: { code: 'INVALID_CREDENTIALS', message: 'Wrong password' },
      }),
    );

    await expect(
      client.post('/auth/login', {}, idSchema, { skipAuth: true }),
    ).rejects.toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' });
    expect(hooks.getAccessToken).not.toHaveBeenCalled();
    expect(hooks.refreshAccessToken).not.toHaveBeenCalled();
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
  });

  it('never refreshes a request that carried no token', async () => {
    const { adapter, hooks, client } = setup(null);
    adapter.mockImplementationOnce(respond(401, unauthorized()));

    await expect(client.get('/things/a', idSchema)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHORIZED',
    });
    expect(hooks.refreshAccessToken).not.toHaveBeenCalled();
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
  });

  it('does not refresh a cancelled request', async () => {
    const { adapter, hooks, client } = setup('old');
    const controller = new AbortController();
    controller.abort();

    await expect(
      client.get('/things/a', idSchema, { signal: controller.signal }),
    ).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
      isNetworkError: false,
    });
    expect(adapter).not.toHaveBeenCalled();
    expect(hooks.refreshAccessToken).not.toHaveBeenCalled();
  });

  it('does not retry a request cancelled while the refresh ran', async () => {
    const { adapter, hooks, client, holdRefresh } = setup('old');
    adapter.mockImplementationOnce(respond(401, unauthorized()));
    const refresh = holdRefresh();
    const controller = new AbortController();

    const request = client.get('/things/a', idSchema, {
      signal: controller.signal,
    });
    await settle();
    controller.abort();
    refresh.resolve('new');

    await expect(request).rejects.toMatchObject({
      code: 'REQUEST_CANCELLED',
      isNetworkError: false,
    });
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(hooks.onSessionExpired).not.toHaveBeenCalled();
  });

  it('passes a 204 through noContentSchema', async () => {
    const { adapter, client } = setup();
    adapter.mockImplementationOnce(respond(204, ''));

    await expect(
      client.post('/auth/logout', undefined, noContentSchema),
    ).resolves.toBeUndefined();
  });
});
