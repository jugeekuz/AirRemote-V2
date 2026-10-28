import { useCallback } from 'react';
import { ScrollView } from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { DevicesStackParamList } from '@app-types';
import { useEditMode } from '@contexts/edit-mode';
import AddDeviceDialog from '@modules/devices/components/add-device-dialog';
import DeviceTile from '@modules/devices/components/device-tile';
import { useAddDeviceDialog, useDeviceList } from '@modules/devices/hooks';
import EmptyTiles from '@components/empty-tiles';
import NoticeBox from '@components/notice-box';
import Screen from '@components/screen';
import SectionHeader from '@components/section-header';
import TileGrid from '@components/tile-grid';
import TopToolbar from '@components/top-toolbar';

const NO_PAIRING_LINK = {};

/**
 * The page under its edit-mode provider: header, notice, the device tiles
 * (or V1's empty state once the list is known to be empty, or "Try again"
 * when the first load failed), and the Add device dialog, which a pairing
 * link (`/pair?mac=…&code=…`) opens filled in.
 */
export default function DeviceList() {
  const { t } = useTranslation('devices');
  const { params = NO_PAIRING_LINK } =
    useRoute<RouteProp<DevicesStackParamList, 'DeviceList'>>();
  const navigation =
    useNavigation<
      NativeStackNavigationProp<DevicesStackParamList, 'DeviceList'>
    >();
  const clearPairingLink = useCallback(() => {
    navigation.setParams({ pairMac: undefined, pairCode: undefined });
  }, [navigation]);
  const addDevice = useAddDeviceDialog(params, clearPairingLink);
  const { devices, isLoaded, isLoadFailed, retry, deleteDevice } =
    useDeviceList();
  const isEditing = useEditMode((state) => state.isEditing);
  const toggleEditMode = useEditMode((state) => state.toggle);
  const stopEditMode = useEditMode((state) => state.stop);

  // V1 left edit mode with the page; here the screen may stay mounted.
  useFocusEffect(useCallback(() => stopEditMode, [stopEditMode]));

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="px-2">
        <TopToolbar />
        <SectionHeader
          title={t('device-list.heading')}
          count={devices.length}
          onAdd={addDevice.open}
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
        {isLoadFailed && (
          <EmptyTiles text={t('device-list.load-failed')} onRetry={retry} />
        )}
      </ScrollView>
      <AddDeviceDialog
        isOpen={addDevice.isOpen}
        pairing={addDevice.pairing}
        onClose={addDevice.close}
      />
    </Screen>
  );
}
