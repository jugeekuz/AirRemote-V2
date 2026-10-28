import { EditModeProvider } from '@contexts/edit-mode';

import DeviceList from './device-list';

/** V1's Devices page; edit mode starts off every time it mounts. */
export default function DeviceListScreen() {
  return (
    <EditModeProvider>
      <DeviceList />
    </EditModeProvider>
  );
}
