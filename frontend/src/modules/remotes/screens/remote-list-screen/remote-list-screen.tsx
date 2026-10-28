import { EditModeProvider } from '@contexts/edit-mode';

import RemoteList from './remote-list';

/** V1's Remotes page; edit mode starts off every time it mounts. */
export default function RemoteListScreen() {
  return (
    <EditModeProvider>
      <RemoteList />
    </EditModeProvider>
  );
}
