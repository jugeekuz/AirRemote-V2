export const REQUEST_TIMEOUT_MS = 30_000;

export const HTTP_STATUS = Object.freeze({
  UNAUTHORIZED: 401,
} as const);

export const HTTP_HEADER = Object.freeze({
  AUTHORIZATION: 'Authorization',
} as const);
