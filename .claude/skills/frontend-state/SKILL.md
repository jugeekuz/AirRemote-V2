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
- a list filter or selection shared by one module's screens → module store
  (`modules/<m>/stores/`);
- a selection two modules share (the device picked in the devices module and
  read by the remotes module) → global store (`src/stores/`), since modules
  never import each other;
- one state per mounted subtree (a screen's edit mode) → scoped store in
  `contexts/` (`@contexts/edit-mode`);
- something that must outlive a screen but not the app (a pairing link
  that arrived before sign-in) → global store in memory
  (`src/stores/pending-pairing`);
- a dialog's visibility, text before debounce → `useState`;
- a form → react-hook-form; the id a screen is about (`remoteId`) → route
  params.

## Steps for a store

- [ ] `pnpm --filter @airremote/frontend create-new store <name> [--module <m>] [--persisted]`
      (`--persisted` adds the `STORE_PERSIST_KEY` entry).
- [ ] Replace the placeholder state; keep `INITIAL_<NAME>_STATE` and `reset()`.
- [ ] Holds data of the signed-in user? Follow the generator's hint: a
      global store is reset in `authStore.signOut()`; a module store in the
      cleanup of an effect in the module's entry hook, since the signed-in
      screens unmount on sign-out (shared layers never import `@modules`) →
      [Stores][stores].
- [ ] Test the facade (`frontend-testing`).

## Steps for a hook

- [ ] `pnpm --filter @airremote/frontend create-new hook <name> [--module <m>]`
      creates `hooks/use-<name>/` with the hook, its test and `index.ts`; a
      module hook is also added to the module's `hooks/index.ts`.
- [ ] Replace the placeholder logic (the generated hook is a toggle).
- [ ] Test it with `renderHook` and a real query client (`frontend-testing`).

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

A module hook reading a global store (shared with the devices module) and a
query:

```ts
// src/modules/remotes/hooks/use-selected-device-remotes/use-selected-device-remotes.ts
import { selectedDeviceStore } from '@stores/selected-device';

const EMPTY_REMOTES: RemoteResponse[] = [];

export function useSelectedDeviceRemotes() {
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
The real one is `src/contexts/edit-mode/edit-mode.context.tsx`: each list
screen mounts its own `EditModeProvider`, so edit mode starts off on every
screen and ends when it unmounts (the screen also stops it on blur).

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

[state]: ../../../frontend/ARCHITECTURE.md#state-ownership
[stores]: ../../../frontend/ARCHITECTURE.md#stores
[pitfalls]: ../../../frontend/ARCHITECTURE.md#pitfalls
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
[naming]: ../../../frontend/ARCHITECTURE.md#naming
