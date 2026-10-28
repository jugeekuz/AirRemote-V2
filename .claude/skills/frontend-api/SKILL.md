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
  `noContentSchema` from the http client (not the contracts'
  `noContentResponseSchema`). `config` is `HttpRequestConfig` (`signal`,
  `skipAuth`, `withCredentials`, `params`), nothing else →
  [The http client][http].
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
  closing a dialog and navigating happen at the call site →
  [Queries][queries]. A delete invalidates in `onSettled` (a 404 means it
  is gone already) and also invalidates its children's lists: a device's
  remotes and buttons, a remote's buttons.
- Mutations other than auth keep TanStack's default and pause offline; only
  the auth ones use `networkMode: 'always'` → [Auth][auth].
- A failed request opens V1's Error dialog with its code's text
  automatically (`notifyApiError` → `alert.error`); don't open one
  yourself. `meta: { silent: true }` when the screen shows its own error,
  `meta.errorMessage` for generic codes → [i18n and error messages][i18n].
  `UNAUTHORIZED` and `INVALID_REFRESH_TOKEN` show nothing (the user lands
  on Login).
- A 401 refreshes the token once and retries; only a refused refresh
  signs out. A refresh that fails offline or with a 5xx keeps the
  session, and the request rejects with that error (so the dialog shows it
  and Query retries it); `UNAUTHORIZED` only reaches a screen when the
  session ended → [The refresh on 401][refresh].
- Empty defaults are module-level constants (`EMPTY_REMOTES`), derived data
  uses `select` with a stable function → [Queries][queries].
- Polling: `refetchInterval` until the status is final, never `setInterval`
  → [Queries][queries]. A failed refetch or poll of a query that has data
  shows no dialog (only a failed first load does, and the screen then
  offers "Try again" with `EmptyTiles`'s `onRetry`), so a poll whose
  failure matters (a device command) handles `isError` itself, as
  `useDeviceCommand` does. A screen kept mounted by the tabs spreads the
  query's options with `subscribed: useIsFocused()`, so it polls only
  while shown, and adds `useRefreshOnFocus(refetch)` (`useDeviceList`).
- `queries/` never imports stores or `@ui`; `api/` never imports queries,
  stores or helpers → [Layers and import rules][layers].

## Example: remotes (a path parameter, a delete)

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
  delete(remoteId: string): Promise<void> {
    return httpClient.delete(
      `/remotes/${encodeURIComponent(remoteId)}`,
      noContentSchema,
    );
  },
};

// src/queries/remotes/remotes.queries.ts
export const remoteKeys = {
  all: ['remotes'] as const,
  lists: () => [...remoteKeys.all, 'list'] as const,
};
export const remoteQueries = {
  list: () =>
    queryOptions({
      queryKey: remoteKeys.lists(),
      queryFn: ({ signal }) => remotesApi.list({ signal }),
    }),
};
```

`useCreateRemoteMutation` and `useDeleteRemoteMutation` invalidate
`remoteKeys.lists()` (the delete also `buttonKeys.lists()`) in `onSettled`;
the wizard closes itself in `mutate(body, { onSuccess })`. See
`src/queries/remotes/` and `src/queries/devices/`.

## Example: a device command (learn a button, press a button)

`POST /remotes/{remoteId}/buttons` and `POST /buttons/{buttonId}/press`
answer 202 with a `DeviceCommandResponse` whose `status` is `pending`. The
app polls `GET /device-commands/{id}` until it is `succeeded`, `failed` or
`expired`; a failed or expired command carries `error.code` (expired is
`DEVICE_NOT_RESPONDING`), and a learned one carries `button`.

```ts
// src/queries/device-commands/device-commands.queries.ts
export const deviceCommandQueries = {
  detail: (id: string) =>
    queryOptions({
      queryKey: deviceCommandKeys.detail(id),
      queryFn: ({ signal }) => deviceCommandsApi.get(id, { signal }),
      // Ask again until the device settles it, unless the poll itself
      // failed for good (a 404 once the device is gone); `false` stops.
      refetchInterval: (query) =>
        query.state.status !== 'error' && query.state.data?.status === 'pending'
          ? DEVICE_COMMAND_POLL_MS
          : false,
      meta: { silent: true },
    }),
};
```

- `useLearnButtonMutation` and `usePressButtonMutation` seed the poll with
  the 202 reply: `queryClient.setQueryData(deviceCommandKeys.detail(id),
command)`.
- **`useDeviceCommand(commandId)`** (`src/hooks/use-device-command`) is
  the reference for following one: it polls, returns `idle`, `pending`,
  `succeeded` (with `button`) or `failed` (with `errorCode`), opens the
  Error dialog with `messages:errors.<CODE>` once per command (a settled
  command is a 200 reply, so the query cache never reports it), and gives
  up with `DEVICE_NOT_RESPONDING` when the command is still pending at its
  lifetime plus 5 s. It is not limited to the focused screen: the result
  must arrive.
- Module hooks build on it: `useLearnButton(remoteId, …)` and
  `usePressButton(buttonId)` in `modules/remotes/hooks/` invalidate the
  buttons list when a learn settles, and the device list when the device
  turned out to be unreachable (`isDeviceUnreachableCode`).
- Starting the command can itself fail as an `ApiError` (`DEVICE_OFFLINE`,
  `DEVICE_BUSY`, `BUTTON_NAME_TAKEN`); the mutation cache shows that like
  any mutation's.

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
[refresh]: ../../../frontend/ARCHITECTURE.md#the-refresh-on-401
