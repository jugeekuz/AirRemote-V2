import { createContext, useContext, useState, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';

type EditModeState = {
  /** The tiles wobble and show their delete badges. */
  isEditing: boolean;
};

type EditModeStore = EditModeState & {
  /** The pencil in the section header: on, then off. */
  toggle: () => void;
  /** Turns it off, e.g. when the screen loses focus. */
  stop: () => void;
};

const INITIAL_EDIT_MODE_STATE: EditModeState = { isEditing: false };

const EditModeContext = createContext<StoreApi<EditModeStore> | null>(null);

/**
 * Edit mode for one screen (V1's EditModeContext). Each screen mounts its
 * own provider, so it starts off on every screen and ends when the screen
 * unmounts.
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const [store] = useState(() =>
    createStore<EditModeStore>()((set) => ({
      ...INITIAL_EDIT_MODE_STATE,
      toggle: () => set((state) => ({ isEditing: !state.isEditing })),
      stop: () => set({ isEditing: false }),
    })),
  );
  return <EditModeContext value={store}>{children}</EditModeContext>;
}

/** Reads the screen's edit mode; select one field per call. */
export function useEditMode<T>(selector: (state: EditModeStore) => T): T {
  const store = useContext(EditModeContext);
  if (!store) {
    throw new Error('useEditMode must be used inside <EditModeProvider>.');
  }
  return useStore(store, selector);
}
