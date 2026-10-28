import { EditModeProvider } from '@contexts/edit-mode';

import RemoteDetails from './remote-details';

/** V1's remote page; edit mode starts off every time it mounts. */
export default function RemoteDetailsScreen() {
  return (
    <EditModeProvider>
      <RemoteDetails />
    </EditModeProvider>
  );
}
