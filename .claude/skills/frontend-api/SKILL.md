---
name: frontend-api
description: Use when working in frontend/src/api or frontend/src/queries, calling a backend endpoint from the app for the first time, adding a query, query key or mutation hook, or polling a device command (learning or pressing a button).
---

# API and queries for a backend domain

One backend domain (devices, remotes, buttons, device commands) has
`src/api/<domain>/` (HTTP only) and `src/queries/<domain>/` (keys, query
options, mutation hooks). Both are global: any module may use them.

## Steps

- [ ] Find the endpoint and its schemas in `packages/contracts/src/<domain>/`
      and `openapi.json`. Not there → stop; the backend comes first.
- [ ] New domain: `pnpm --filter @airremote/frontend create-new domain <domain>`,
      named like the resource, which is also its path (`devices` →
      `/devices`, `device-commands` → `/device-commands`). It writes
      `xApi` with `list`, `get(id)` and `create`, `xKeys`, `xQueries.list()` /
      `.detail(id)` and `useCreateXMutation`, each with a test. Then:
  - replace its placeholder schemas and types with the contract's
    (`deviceListResponseSchema`, `DeviceResponse`, ...) and drop the type
    re-exports from `api/<domain>/index.ts`;
  - keep only the calls the API has, with its real paths (the only get-by-id
    is `GET /device-commands/{id}`; remotes are created under
    `/devices/{deviceId}/remotes`), and fix the generated tests to match.
- [ ] Existing domain: add the API method and its test, the key to `xKeys`,
      then a `queryOptions` in `xQueries` or a `useXMutation` hook, with tests.
- [ ] Prettier from `frontend/` (the paths it prints are relative to it).

## Rules

- `httpClient.get(url, schema, config)`, `.post(url, body, schema, config)`
  (also `put`, `patch`), `.delete(url, schema, config)`; a 204 uses
  `noContentSchema`.
  `config` is `HttpRequestConfig` (`signal`, `skipAuth`, `withCredentials`,
  `params`), nothing else → [The http client][http].
- API functions return contract types; reads take `options?: RequestOptions`
  and pass it on → [Layers and import rules][layers]. Path params go through
  `encodeURIComponent`, as the generated code does.
- Every rejection is an `ApiError`; switch on `code`, never on `message` →
  [`ApiError`][apierror].
- Keys only from the factory (`xKeys.all`, `.lists()`, `.list(parentId)`);
  never inline. A key holds every variable `queryFn` uses → [Queries][queries],
  [Pitfalls][pitfalls].
- Query factories are plain functions: no hooks inside; `queryFn` passes
  `{ signal }` on → [Queries][queries].
- Mutation hooks own the cache effects (`invalidateQueries`, `setQueryData`);
  toasts and navigation happen at the call site → [Queries][queries].
- Mutations other than auth keep TanStack's default and pause offline; only
  the auth ones use `networkMode: 'always'` → [Auth][auth].
- Errors toast by code automatically; `meta: { silent: true }` when the
  screen shows its own error, `meta.errorMessage` for generic codes →
  [i18n and error messages][i18n].
- Empty defaults are module-level constants (`EMPTY_REMOTES`), derived data
  uses `select` with a stable function → [Queries][queries].
- Polling: `refetchInterval` until the status is final, never `setInterval`
  → [Queries][queries].
- `queries/` never imports stores or `@ui`; `api/` never imports queries,
  stores or helpers → [Layers and import rules][layers].

## Example: remotes (a path parameter, a list for a parent)

```ts
// src/api/remotes/remotes.api.ts
export const remotesApi = {
  list(options?: RequestOptions): Promise<RemoteResponse[]> {
    return httpClient.get('/remotes', remoteListResponseSchema, options);
  },
  create(deviceId: string, body: CreateRemoteRequest): Promise<RemoteResponse> {
    return httpClient.post(
      `/devices/${encodeURIComponent(deviceId)}/remotes`,
      body,
      remoteResponseSchema,
    );
  },
};

// src/queries/remotes/remotes.queries.ts
export const remotesKeys = {
  all: ['remotes'] as const,
  lists: () => [...remotesKeys.all, 'list'] as const,
};
export const remotesQueries = {
  list: () =>
    queryOptions({
      queryKey: remotesKeys.lists(),
      queryFn: ({ signal }) => remotesApi.list({ signal }),
    }),
};
```

`useCreateRemoteMutation` invalidates `remotesKeys.lists()` on success;
the screen closes its dialog in `mutate(body, { onSuccess })`. Compare
`src/api/auth/auth.api.ts` and `src/queries/auth/auth.mutations.ts`.

## Example: a device command (learn a button, press a button)

`POST /remotes/{remoteId}/buttons` and `POST /buttons/{buttonId}/press`
answer 202 with a `DeviceCommandResponse` whose `status` is `pending`. The
app polls `GET /device-commands/{id}` until it is `succeeded`, `failed` or
`expired`; a failed or expired command carries `error.code` (expired is
`DEVICE_NOT_RESPONDING`), and a learned one carries `button`.

```ts
// src/queries/device-commands/device-commands.queries.ts
export const deviceCommandsQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: deviceCommandsKeys.detail(id),
      queryFn: ({ signal }) => deviceCommandsApi.get(id, { signal }),
      // Ask again until the device settles it; `false` stops polling.
      refetchInterval: (query) =>
        query.state.data?.status === 'pending'
          ? DEVICE_COMMAND_POLL_INTERVAL_MS
          : false,
    }),
};
```

- The learn/press mutation seeds the poll with its 202 reply:
  `queryClient.setQueryData(deviceCommandsKeys.detail(command.id), command)`.
- The interval is a named constant (`device-commands.constants.ts` next to
  the queries).
- A hook (`useLearnButton(remoteId)`) runs the mutation, polls the command,
  and when it succeeds invalidates the remote's buttons list. A settled
  command's `error.code` is shown as `messages:errors.<CODE>`; it is a 200
  reply, so the query cache does not toast it.
- Starting the command can itself fail as an `ApiError` (`DEVICE_OFFLINE`,
  `DEVICE_BUSY`); that toasts like any mutation.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

Tests: `frontend-testing` (API with a mocked `@api/http-client`; queries and
mutations with `jest.mock('@api/<domain>')` and a real query client).

[http]: ../../../frontend/ARCHITECTURE.md#the-http-client
[apierror]: ../../../frontend/ARCHITECTURE.md#apierror
[queries]: ../../../frontend/ARCHITECTURE.md#queries
[pitfalls]: ../../../frontend/ARCHITECTURE.md#pitfalls
[auth]: ../../../frontend/ARCHITECTURE.md#auth
[i18n]: ../../../frontend/ARCHITECTURE.md#i18n-and-error-messages
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
