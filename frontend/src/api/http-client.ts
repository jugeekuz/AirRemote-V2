import axios, {
  AxiosHeaders,
  isAxiosError,
  type AxiosAdapter,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { z } from 'zod';

import type { ApiError, RequestOptions } from '@app-types';

import { isApiError, toApiError } from './api-error';
import { HTTP_HEADER, HTTP_STATUS, REQUEST_TIMEOUT_MS } from './api.constants';
import { API_URL } from './servers';

/** How the http client reaches app state, injected so it never imports stores. */
export type HttpClientHooks = {
  /** The current access token, or null when signed out. */
  getAccessToken: () => string | null;
  /** Gets a new access token (from the refresh cookie) and stores it; rejects when it can't. */
  refreshAccessToken: () => Promise<string>;
  /**
   * Called when the server refuses the session: the refresh is answered with
   * a 401 (e.g. `INVALID_REFRESH_TOKEN`), or the refreshed token is refused.
   * Signs out locally, so `getAccessToken` returns null afterwards. A refresh
   * that fails for any other reason (offline, a 5xx, a malformed body) does
   * not call it: the session stays and the next request tries again.
   */
  onSessionExpired: () => void;
};

/** What a call may set on a request; everything else is the client's. */
export type HttpRequestConfig = RequestOptions & {
  /** Send no access token and never refresh (the /auth calls). */
  skipAuth?: boolean;
  /** Send cookies cross-origin on web (the refresh cookie). */
  withCredentials?: boolean;
  /** Query string parameters. */
  params?: Record<string, unknown>;
};

export type HttpClientOptions = {
  baseURL: string;
  timeoutMs?: number;
  /** Replaces axios' network adapter, e.g. with a fake in tests. */
  adapter?: AxiosAdapter;
};

/**
 * Every method resolves with the response body parsed by `schema` and rejects
 * with an `ApiError`. A body that fails the schema rejects with
 * `INVALID_RESPONSE`.
 */
export type HttpClient = {
  /** Connects the client to app state; call it before any request. */
  configure: (hooks: HttpClientHooks) => void;
  get: <S extends z.ZodType>(
    url: string,
    schema: S,
    config?: HttpRequestConfig,
  ) => Promise<z.output<S>>;
  post: <S extends z.ZodType>(
    url: string,
    body: unknown,
    schema: S,
    config?: HttpRequestConfig,
  ) => Promise<z.output<S>>;
  put: <S extends z.ZodType>(
    url: string,
    body: unknown,
    schema: S,
    config?: HttpRequestConfig,
  ) => Promise<z.output<S>>;
  patch: <S extends z.ZodType>(
    url: string,
    body: unknown,
    schema: S,
    config?: HttpRequestConfig,
  ) => Promise<z.output<S>>;
  delete: <S extends z.ZodType>(
    url: string,
    schema: S,
    config?: HttpRequestConfig,
  ) => Promise<z.output<S>>;
};

/** For responses without a body (204): accepts anything, resolves `undefined`. */
export const noContentSchema = z.unknown().transform(() => undefined);

/** Until `configure` runs, the client behaves as signed out. */
const SIGNED_OUT_HOOKS: HttpClientHooks = {
  getAccessToken: () => null,
  refreshAccessToken: () =>
    Promise.reject(new Error('The http client is not configured.')),
  onSessionExpired: () => {},
};

/**
 * Whether a failed refresh means the session is over: the server refused the
 * refresh cookie. Anything else (offline, a 5xx, a malformed body) is
 * transient.
 */
function isRefusedRefresh(error: unknown): boolean {
  return isApiError(error) && error.status === HTTP_STATUS.UNAUTHORIZED;
}

/** Whether the server refused the access token this request carried. */
function isRefusedAccessToken(
  config: InternalAxiosRequestConfig,
  apiError: ApiError,
): boolean {
  return (
    apiError.status === HTTP_STATUS.UNAUTHORIZED &&
    !config.skipAuth &&
    config.headers.has(HTTP_HEADER.AUTHORIZATION)
  );
}

function bearer(token: string): string {
  return `Bearer ${token}`;
}

/** Whether the request went out with this token (not an older one). */
function sentToken(
  config: InternalAxiosRequestConfig,
  token: string | null,
): boolean {
  return (
    token !== null &&
    config.headers.get(HTTP_HEADER.AUTHORIZATION) === bearer(token)
  );
}

const CANCELLED: ApiError = {
  code: 'REQUEST_CANCELLED',
  message: 'The request was cancelled.',
  isNetworkError: false,
};

/** Builds the axios config from the fields a call may set, and nothing else. */
function toAxiosConfig({
  signal,
  skipAuth,
  withCredentials,
  params,
}: HttpRequestConfig = {}): AxiosRequestConfig {
  return { signal, skipAuth, withCredentials, params };
}

function parseBody<S extends z.ZodType>(
  response: AxiosResponse<unknown>,
  schema: S,
): z.output<S> {
  const result = schema.safeParse(response.data);
  if (result.success) {
    return result.data;
  }
  const invalidResponse: ApiError = {
    status: response.status,
    code: 'INVALID_RESPONSE',
    message: "The server's response did not have the expected shape.",
    details: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
    isNetworkError: false,
  };
  throw invalidResponse;
}

export function createHttpClient({
  baseURL,
  timeoutMs = REQUEST_TIMEOUT_MS,
  adapter,
}: HttpClientOptions): HttpClient {
  const instance = axios.create({
    baseURL,
    timeout: timeoutMs,
    ...(adapter && { adapter }),
  });
  let hooks = SIGNED_OUT_HOOKS;
  /** The refresh in flight, shared by every 401 that arrives while it runs. */
  let pendingRefresh: Promise<string> | null = null;

  /** Ends the session only when the server refused the refresh. */
  async function refreshOrEndSession(): Promise<string> {
    try {
      return await hooks.refreshAccessToken();
    } catch (error) {
      if (isRefusedRefresh(error)) {
        hooks.onSessionExpired();
      }
      throw error;
    }
  }

  /** Starts a refresh, or joins the one in flight. */
  function refreshOnce(): Promise<string> {
    pendingRefresh ??= refreshOrEndSession().finally(() => {
      pendingRefresh = null;
    });
    return pendingRefresh;
  }

  instance.interceptors.request.use((config) => {
    // A retry already carries the refreshed token.
    if (config.skipAuth || config.retried) {
      return config;
    }
    const token = hooks.getAccessToken();
    if (token) {
      config.headers.set(HTTP_HEADER.AUTHORIZATION, bearer(token));
    }
    return config;
  });

  /** The one retry of a refused request, with a newer token. */
  function retry(config: InternalAxiosRequestConfig, token: string) {
    return instance.request({
      ...config,
      retried: true,
      headers: new AxiosHeaders(config.headers).set(
        HTTP_HEADER.AUTHORIZATION,
        bearer(token),
      ),
    });
  }

  instance.interceptors.response.use(undefined, async (error: unknown) => {
    const apiError = toApiError(error);
    const config = isAxiosError(error) ? error.config : undefined;
    if (!config || !isRefusedAccessToken(config, apiError)) {
      throw apiError;
    }
    const current = hooks.getAccessToken();
    if (config.retried) {
      // A refreshed token was refused too. Only end the session if it is
      // still the current one: another refused retry may have ended it, or
      // a newer token may exist.
      if (sentToken(config, current)) {
        hooks.onSessionExpired();
      }
      throw apiError;
    }
    if (current === null) {
      // Signed out while the request was in flight.
      throw apiError;
    }
    if (!sentToken(config, current)) {
      // Another request refreshed the token meanwhile: use the new one.
      return retry(config, current);
    }
    let token: string;
    try {
      token = await refreshOnce();
    } catch {
      // Each waiting request rejects with its own 401, whether the session
      // ended or the refresh failed for a transient reason.
      throw apiError;
    }
    if (config.signal?.aborted) {
      throw CANCELLED;
    }
    return retry(config, token);
  });

  async function send<S extends z.ZodType>(
    request: AxiosRequestConfig,
    schema: S,
  ): Promise<z.output<S>> {
    let response: AxiosResponse<unknown>;
    try {
      response = await instance.request<unknown>(request);
    } catch (error) {
      throw toApiError(error);
    }
    return parseBody(response, schema);
  }

  return {
    configure: (nextHooks) => {
      hooks = nextHooks;
    },
    get: (url, schema, config) =>
      send({ ...toAxiosConfig(config), method: 'get', url }, schema),
    post: (url, body, schema, config) =>
      send(
        { ...toAxiosConfig(config), method: 'post', url, data: body },
        schema,
      ),
    put: (url, body, schema, config) =>
      send(
        { ...toAxiosConfig(config), method: 'put', url, data: body },
        schema,
      ),
    patch: (url, body, schema, config) =>
      send(
        { ...toAxiosConfig(config), method: 'patch', url, data: body },
        schema,
      ),
    delete: (url, schema, config) =>
      send({ ...toAxiosConfig(config), method: 'delete', url }, schema),
  };
}

/** The app's client for the AirRemote API. */
export const httpClient = createHttpClient({ baseURL: API_URL });

/** Called once, from the app's bootstrap, with the auth store's hooks. */
export const configureHttpClient = httpClient.configure;
