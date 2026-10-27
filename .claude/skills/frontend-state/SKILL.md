---
name: frontend-state
description: Use when deciding where a piece of app state lives in frontend/, or working in src/stores, src/modules/*/stores, src/contexts, src/modules/*/contexts, src/hooks or src/modules/*/hooks (a Zustand store, a persisted store, a provider with a scoped store, a hook that combines queries and stores).
---

# Stores, contexts and hooks

Each kind of state has one owner. Pick it first, then build the smallest
thing that holds it.

## Where it lives

The table with the reasons is [State ownership][state]. In AirRemote terms:

- devices, remotes, buttons, a device command → the query cache, never a
  store or a context (`frontend-api`);
- access token, auth status, language → global store (`src/stores/`);
- the selected device id, a list filter shared by a module's screens →
  module store (`modules/<m>/stores/`);
- one multi-step flow per mounted subtree (pairing a device) → scoped store
  in `contexts/`;
- a dialog's visibility, text before debounce → `useState`;
- a form → react-hook-form; a `remoteId` for a screen → route params.

## Steps for a store

- [ ] `pnpm --filter @airremote/frontend create-new store <name> [--module <m>] [--persisted]`
      (`--persisted` adds the `STORE_PERSIST_KEY` entry).
- [ ] Replace the placeholder state; keep `INITIAL_<NAME>_STATE` and `reset()`.
- [ ] Holds data of the signed-in user? A **global** store is reset in
      `authStore.signOut()` (`src/stores/auth/auth.store.ts`). A **module**
      store can't be: global stores must not import `@modules`, whatever the
      generator's hint says. Make it global, or reset it in the cleanup of an
      effect in the module's entry hook (the signed-in screens unmount on
      sign-out).
- [ ] Test the facade (`frontend-testing`).

## Rules

- A private `useXStore` and an exported facade `xStore`: actions call
  `setState`; `getX()` reads outside React; `useX()` subscribes →
  [Stores][stores].
- State is serializable data only; no server data, ids instead →
  [State ownership][state], [Pitfalls][pitfalls].
- Each `useX()` selects one primitive or one stable reference; several
  fields go through `useShallow` from `zustand/react/shallow`. A selector
  returning a new object or array loops forever → [Stores][stores].
- Facade hooks (`xStore.useY()`) only at the top level of components and
  hooks; the lint can't see member calls → [Stores][stores].
- Persisted: `persist` + `createJSONStorage(() => persistStorage)` from
  `@adapters/storage`, `name` from `STORE_PERSIST_KEY`, a `version`; bump
  `version` and add `migrate` whenever the persisted shape changes; a
  `merge` that drops unsupported values, as `preferencesStore` does →
  [Stores][stores].
- Stores never fetch and queries never touch stores; hooks (or `src/app`)
  compose them → [Layers and import rules][layers].
- Hooks may use queries, mutations, stores, contexts and helpers, never
  `@api`, components or screens → [Layers and import rules][layers].
- A context only for a library provider, a scoped store, or non-serializable
  values (refs, shared values); never server data, never global state.

## Example: a hook composing a mutation and a store

`src/hooks/use-login/use-login.ts` runs `useLoginMutation()` and, on
success, calls `authStore.signIn(accessToken)`. The mutation knows nothing
about the store; the hook is where they meet. `src/hooks/use-logout/` shows
cleanup that must happen even on failure (`finally`).

A module hook reading a store and a query:

```ts
// src/modules/remotes/hooks/use-device-remotes/use-device-remotes.ts
const EMPTY_REMOTES: RemoteResponse[] = [];

export function useDeviceRemotes() {
  const deviceId = selectedDeviceStore.useDeviceId();
  const selectOfDevice = useCallback(
    (remotes: RemoteResponse[]) => getRemotesOfDevice(remotes, deviceId),
    [deviceId],
  );
  const { data, isPending } = useQuery({
    ...remotesQueries.list(),
    select: selectOfDevice,
  });

  return { remotes: data ?? EMPTY_REMOTES, isPending };
}
```

## Example: a scoped store (one per mounted flow)

```tsx
// src/modules/devices/contexts/pairing.context.tsx
type PairingState = { step: PairingStep; name: string };
type PairingStore = PairingState & {
  setName: (name: string) => void;
  next: () => void;
};

const PairingContext = createContext<StoreApi<PairingStore> | null>(null);

export function PairingProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    createStore<PairingStore>()((set) => ({
      ...INITIAL_PAIRING_STATE,
      setName: (name) => set({ name }),
      next: () => set((state) => ({ step: getNextPairingStep(state.step) })),
    })),
  );
  return <PairingContext value={store}>{children}</PairingContext>;
}

export function usePairing<T>(selector: (state: PairingStore) => T): T {
  const store = useContext(PairingContext);
  if (!store) {
    throw new Error('usePairing must be used inside <PairingProvider>.');
  }
  return useStore(store, selector);
}
```

The file is `contexts/<name>.context.tsx` exporting `XProvider` and `useX`
([Naming][naming]); actions live in the store, since there is no facade.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

[state]: ../../../frontend/ARCHITECTURE.md#state-ownership
[stores]: ../../../frontend/ARCHITECTURE.md#stores
[pitfalls]: ../../../frontend/ARCHITECTURE.md#pitfalls
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
[naming]: ../../../frontend/ARCHITECTURE.md#naming
