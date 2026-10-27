---
name: frontend-testing
description: Use when writing, changing or fixing tests in frontend/ (*.test.ts or *.test.tsx next to app code), when a frontend Jest test fails, hangs, is flaky or leaks state between tests, or when deciding what a new frontend file needs tested.
---

# Frontend tests

Jest through jest-expo, with @testing-library/react-native 14. A test sits
next to its file as `<name>.test.ts(x)`, not in `__tests__/` →
[Testing][testing].

## What to test, per layer

| Layer                        | Test                                                                        | Reference                                                         |
| ---------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| api                          | unit: mock `@api/http-client`, assert URL, schema use, `{ signal }`         | generated `<domain>.api.test.ts`, `src/api/auth/auth.api.test.ts` |
| queries (options, mutations) | integration: `renderHook` + real query client, `jest.mock('@api/<domain>')` | `src/queries/auth/auth.mutations.test.tsx`                        |
| stores                       | unit: drive the facade, `reset()` in `beforeEach`                           | `src/stores/auth/auth.store.test.ts`                              |
| helpers, utils, config       | unit: inputs → outputs                                                      | `src/helpers/errors/errors.helpers.test.ts`                       |
| hooks, contexts              | integration: `renderHook` with `createQueryWrapper()`                       | `src/hooks/use-login/use-login.test.ts`                           |
| components                   | unit + integration: `renderWithProviders`, user events                      | generated `<name>.test.tsx`                                       |
| screens                      | optional integration, API mocked                                            | `src/modules/auth/screens/login-screen/login-screen.test.tsx`     |
| navigation, constants, app   | none                                                                        |                                                                   |

## Steps

- [ ] The generator already wrote a first test; extend it rather than start
      over.
- [ ] Cover the happy path, the error path (an `ApiError` rejection) and one
      edge case (empty list, pending state).
- [ ] Run just your file while working:
      `pnpm --filter @airremote/frontend test -- src/queries/remotes`.
- [ ] Then the whole suite (Verify, below).

## Rules

- Mock at the API boundary: `jest.mock('@api/<domain>')` and
  `jest.mocked(xApi)`. Never mock TanStack Query, Zustand or the http client
  in a query, hook or screen test → [Testing][testing].
- A new query client per test: `createTestQueryClient()`,
  `createQueryWrapper(client?)` or `renderWithProviders(ui, { queryClient })`
  from `@utils/tests` (which also re-exports RNTL). Hold the client to
  assert cache effects (`queryClient.getQueryState(key)?.isInvalidated`) →
  [Pitfalls][pitfalls].
- Real stores, reset in `beforeEach` (`authStore.reset()`, then the state
  the test needs, e.g. `authStore.signIn('token-1')`); `jest.resetAllMocks()`
  too.
- RNTL 14's `render`, `renderHook`, `rerender`, `unmount` and `act` are
  async: `await` every one → [Testing][testing].
- Query as a user would: `getByRole('button', { name })`, `getByLabelText`,
  then `getByText` only to assert what's displayed. Labels are found through
  `nativeID` + `aria-labelledby` → [Testing][testing].
- The i18n mock echoes keys and options, without `ns`:
  `t('learn-button.waiting', { device: 'Desk' })` is
  `'learn-button.waiting | device: Desk'`. Assert keys, not English.
- No sleeps. `await waitFor(...)` and `findBy*` for async work. To hold a
  request pending, return a promise you resolve or reject later (see the
  Login screen test's "disables the button while signing in").
- Timers (debounce, polling): `jest.useFakeTimers()` in `beforeEach`,
  `jest.useRealTimers()` in `afterEach`, and `jest.advanceTimersByTime(MS)`
  inside `await act(async () => { ... })`, with the named constant
  (`src/hooks/use-debounced-value/use-debounced-value.test.ts`).
- StrictMode runs effects twice only when `<StrictMode>` is the root
  element passed to `render`, not when it comes from a `wrapper` →
  [Testing][testing].
- A grouped helper object is mocked as an object
  (`jest.mock('@helpers/x', () => ({ xHelpers: { canY: jest.fn() } }))`);
  single functions individually. Prefer the real helper when it's cheap.
- Tests are exempt from the layer rules, not from no-`../` or
  `process.env` → [Layers and import rules][layers].
- `jest.setup.ts` already mocks `@config/env` (`https://api.test`), the
  storage adapter (in-memory), NetInfo, react-i18next and the kit's native
  modules. Add a global mock there only for a new native dependency.

## Example: polling a device command

```ts
jest.mock('@api/device-commands');
const api = jest.mocked(deviceCommandsApi);

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

it('polls until the device settles the command, then stops', async () => {
  api.get
    .mockResolvedValueOnce({ ...command, status: 'pending' })
    .mockResolvedValueOnce({ ...command, status: 'succeeded', button });
  const { result } = await renderHook(
    () => useQuery(deviceCommandsQueries.detail(command.id)),
    { wrapper: createQueryWrapper() },
  );
  await waitFor(() => {
    expect(result.current.data?.status).toBe('pending');
  });

  await act(async () => {
    jest.advanceTimersByTime(DEVICE_COMMAND_POLL_INTERVAL_MS);
  });

  await waitFor(() => {
    expect(result.current.data?.status).toBe('succeeded');
  });
  await act(async () => {
    jest.advanceTimersByTime(DEVICE_COMMAND_POLL_INTERVAL_MS * 3);
  });
  expect(api.get).toHaveBeenCalledTimes(2);
});
```

Advance by the named interval rather than relying on `waitFor`, whose
default timeout (1 s) may be shorter than the interval.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

The layer-rule tests (`frontend/eslint/layer-boundaries.test.ts`) run in the
root Vitest unit project: `pnpm test:unit`.

[testing]: ../../../frontend/ARCHITECTURE.md#testing
[pitfalls]: ../../../frontend/ARCHITECTURE.md#pitfalls
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
