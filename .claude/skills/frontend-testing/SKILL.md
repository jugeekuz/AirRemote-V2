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
| components                   | unit + integration: `renderWithProviders`, user events                      | `src/components/delete-badge/delete-badge.test.tsx`               |
| screens                      | integration, API mocked, real query client and navigator                    | `src/modules/devices/screens/device-list-screen/`                 |
| app (session hooks, errors)  | unit: `@api/auth` or `@ui` mocked, real `authStore` and query client        | `src/app/bootstrap.test.ts`, `src/app/notify-api-error.test.ts`   |
| navigation, constants        | none                                                                        |                                                                   |

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
  storage adapter (in-memory), NetInfo, react-i18next, the safe area and
  the kit's native modules. Add a global mock there only for a new native
  dependency. `expo-camera` is mapped to `mocks/expo-camera.mock.tsx`: set
  the permission with `cameraMock`, scan with
  `fireEvent(screen.getByTestId(CAMERA_VIEW_TEST_ID), 'barcodeScanned', { type: 'qr', data })`,
  fail it with `'mountError'` (`src/ui/qr-scanner/qr-scanner.test.tsx`).
- The Error and Confirmation dialogs render through `renderWithProviders`
  (it mounts `UiProvider`): assert the message text (`errors.<CODE>` with
  the `t` mock) and press `OK`, `Yes` or `No`; or spy on `alert.error`
  from `@ui` in a hook test (`use-device-command.test.ts`).
- A screen test mounts the real screen in a navigator with a second route
  ("Elsewhere") to check focus and blur (edit mode stops, the list
  refetches), with the app's `createQueryClient(onApiError)` to see what
  reaches the Error dialog (`device-list-screen.test.tsx`).
- Under fake timers TanStack Query hands a query's answer over on a
  zero-delay timer, so a timing test advances a few ms past the moment it
  checks (`RENDER_MS` in `use-press-button.test.ts`), and sets the app's
  `staleTime` where a seeded query must not refetch on mount.
- react-native-web's `aria-*` props are folded into `accessibilityState`
  by React Native in Jest; to assert them, record the props given to
  `Pressable` (`submit-button.test.tsx`).

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
    () => useQuery(deviceCommandQueries.detail(command.id)),
    { wrapper: createQueryWrapper() },
  );
  await waitFor(() => {
    expect(result.current.data?.status).toBe('pending');
  });

  await act(async () => {
    jest.advanceTimersByTime(DEVICE_COMMAND_POLL_MS);
  });

  await waitFor(() => {
    expect(result.current.data?.status).toBe('succeeded');
  });
  await act(async () => {
    jest.advanceTimersByTime(DEVICE_COMMAND_POLL_MS * 3);
  });
  expect(api.get).toHaveBeenCalledTimes(2);
});
```

Advance by the named interval rather than relying on `waitFor`, whose
default timeout (1 s) may be shorter than the interval. The real tests are
`src/queries/device-commands/device-commands.queries.test.tsx` (the poll)
and `src/hooks/use-device-command/use-device-command.test.ts` (states,
the Error dialog once per command, giving up past the deadline).

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

The layer-rule tests (`frontend/eslint/layer-boundaries.test.ts`) run in the
root Vitest unit project: `pnpm test:unit`.

[testing]: ../../../frontend/ARCHITECTURE.md#testing
[pitfalls]: ../../../frontend/ARCHITECTURE.md#pitfalls
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
