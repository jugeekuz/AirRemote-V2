import axios, {
  AxiosHeaders,
  isAxiosError,
  type AxiosAdapter,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { z } from 'zod';

import type { ApiError } from '@app-types';

import { toApiError } from './api-error';
import { HTTP_HEADER, HTTP_STATUS, REQUEST_TIMEOUT_MS } from './api.constants';
import { API_URL } from './servers';

/** How the http client reaches app state, injected so it never imports stores. */
export type HttpClientHooks = {
  /** The current access token, or null when signed out. */
  getAccessToken: () => string | null;
  /** Gets a new access token (from the refresh cookie) and stores it; rejects when it can't. */
  refreshAccessToken: () => Promise<string>;
  /** Called once when a refresh fails or the refreshed token is refused: sign out locally. */
  onSessionExpired: () => void;
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
    config?: AxiosRequestConfig,
  ) => Promise<z.output<S>>;
  post: <S extends z.ZodType>(
    url: string,
    body: unknown,
    schema: S,
    config?: AxiosRequestConfig,
  ) => Promise<z.output<S>>;
  put: <S extends z.ZodType>(
    url: string,
    body: unknown,
    schema: S,
    config?: AxiosRequestConfig,
  ) => Promise<z.output<S>>;
  patch: <S extends z.ZodType>(
    url: string,
    body: unknown,
    schema: S,
    config?: AxiosRequestConfig,
  ) => Promise<z.output<S>>;
  delete: <S extends z.ZodType>(
    url: string,
    schema: S,
    config?: AxiosRequestConfig,
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

  async function refreshOrEndSession(): Promise<string> {
    try {
      return await hooks.refreshAccessToken();
    } catch (error) {
      hooks.onSessionExpired();
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

  instance.interceptors.response.use(undefined, async (error: unknown) => {
    const apiError = toApiError(error);
    const config = isAxiosError(error) ? error.config : undefined;
    if (!config || !isRefusedAccessToken(config, apiError)) {
      throw apiError;
    }
    if (config.retried) {
      // The refreshed token was refused too: the session is gone.
      hooks.onSessionExpired();
      throw apiError;
    }
    let token: string;
    try {
      token = await refreshOnce();
    } catch {
      throw apiError;
    }
    return instance.request({
      ...config,
      retried: true,
      headers: new AxiosHeaders(config.headers).set(
        HTTP_HEADER.AUTHORIZATION,
        bearer(token),
      ),
    });
  });

  async function send<S extends z.ZodType>(
    config: AxiosRequestConfig,
    schema: S,
  ): Promise<z.output<S>> {
    let response: AxiosResponse<unknown>;
    try {
      response = await instance.request<unknown>(config);
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
      send({ ...config, method: 'get', url }, schema),
    post: (url, body, schema, config) =>
      send({ ...config, method: 'post', url, data: body }, schema),
    put: (url, body, schema, config) =>
      send({ ...config, method: 'put', url, data: body }, schema),
    patch: (url, body, schema, config) =>
      send({ ...config, method: 'patch', url, data: body }, schema),
    delete: (url, schema, config) =>
      send({ ...config, method: 'delete', url }, schema),
  };
}

/** The app's client for the AirRemote API. */
export const httpClient = createHttpClient({ baseURL: API_URL });

/** Called once, from the app's bootstrap, with the auth store's hooks. */
export const configureHttpClient = httpClient.configure;
