import { useCallback } from 'react';
import { ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { useEditMode } from '@contexts/edit-mode';
import DeviceTile from '@modules/devices/components/device-tile';
import { useDeviceList } from '@modules/devices/hooks';
import EmptyTiles from '@components/empty-tiles';
import NoticeBox from '@components/notice-box';
import SectionHeader from '@components/section-header';
import TileGrid from '@components/tile-grid';
import TopToolbar from '@components/top-toolbar';

/** No device to enroll from here yet: the Add device wizard comes next. */
function openAddDevice() {}

/**
 * The page under its edit-mode provider: header, notice, the device tiles
 * (or V1's empty state once the list is known to be empty).
 */
export default function DeviceList() {
  const { t } = useTranslation('devices');
  const { devices, isLoaded, deleteDevice } = useDeviceList();
  const isEditing = useEditMode((state) => state.isEditing);
  const toggleEditMode = useEditMode((state) => state.toggle);
  const stopEditMode = useEditMode((state) => state.stop);

  // V1 left edit mode with the page; here the screen may stay mounted.
  useFocusEffect(useCallback(() => stopEditMode, [stopEditMode]));

  return (
    <ScrollView
      className="flex-1 bg-background"
      contentContainerClassName="px-2"
    >
      <TopToolbar />
      <SectionHeader
        title={t('device-list.heading')}
        count={devices.length}
        onAdd={openAddDevice}
        onToggleEdit={toggleEditMode}
      />
      <NoticeBox>{t('device-list.notice')}</NoticeBox>
      {devices.length > 0 && (
        <TileGrid>
          {devices.map((device) => (
            <DeviceTile
              key={device.id}
              device={device}
              isEditing={isEditing}
              onDelete={deleteDevice}
            />
          ))}
        </TileGrid>
      )}
      {isLoaded && devices.length === 0 && (
        <EmptyTiles text={t('device-list.empty')} />
      )}
    </ScrollView>
  );
}
