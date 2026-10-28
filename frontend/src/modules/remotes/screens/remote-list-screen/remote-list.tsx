import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { RemotesStackParamList } from '@app-types';
import { useEditMode } from '@contexts/edit-mode';
import AddRemoteDialog from '@modules/remotes/components/add-remote-dialog';
import RemoteTile from '@modules/remotes/components/remote-tile';
import { getRemoteDevice } from '@modules/remotes/helpers/remotes';
import { useRemoteList } from '@modules/remotes/hooks';
import EmptyTiles from '@components/empty-tiles';
import NoticeBox from '@components/notice-box';
import Screen from '@components/screen';
import SectionHeader from '@components/section-header';
import TileGrid from '@components/tile-grid';
import TopToolbar from '@components/top-toolbar';

/**
 * The page under its edit-mode provider: header, notice, the remote tiles
 * (or V1's empty state once the list is known to be empty, "Try again"
 * when the first load failed, or the offline line while it waits for the
 * network), and the Add Remote dialog.
 */
export default function RemoteList() {
  const { t } = useTranslation('remotes');
  const navigation =
    useNavigation<
      NativeStackNavigationProp<RemotesStackParamList, 'RemoteList'>
    >();
  const {
    remotes,
    devices,
    isLoaded,
    isLoadFailed,
    isOffline,
    retry,
    deleteRemote,
  } = useRemoteList();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const isEditing = useEditMode((state) => state.isEditing);
  const toggleEditMode = useEditMode((state) => state.toggle);
  const stopEditMode = useEditMode((state) => state.stop);

  // V1 left edit mode with the page; here the screen stays mounted under
  // the remote's details and behind the other tabs.
  useFocusEffect(useCallback(() => stopEditMode, [stopEditMode]));

  const openRemote = useCallback(
    (remoteId: string) => {
      navigation.navigate('RemoteDetails', { remoteId });
    },
    [navigation],
  );

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="px-2">
        <TopToolbar />
        <SectionHeader
          title={t('remote-list.heading')}
          count={remotes.length}
          onAdd={() => {
            setIsAddOpen(true);
          }}
          onToggleEdit={toggleEditMode}
        />
        <NoticeBox>{t('remote-list.notice')}</NoticeBox>
        {remotes.length > 0 && (
          <TileGrid>
            {remotes.map((remote) => (
              <RemoteTile
                key={remote.id}
                remote={remote}
                device={getRemoteDevice(remote, devices)}
                isEditing={isEditing}
                onOpen={openRemote}
                onDelete={deleteRemote}
              />
            ))}
          </TileGrid>
        )}
        {isLoaded && remotes.length === 0 && (
          <EmptyTiles text={t('remote-list.empty')} />
        )}
        {isLoadFailed && (
          <EmptyTiles text={t('remote-list.load-failed')} onRetry={retry} />
        )}
        {isOffline && <EmptyTiles isOffline />}
      </ScrollView>
      <AddRemoteDialog
        isOpen={isAddOpen}
        onClose={() => {
          setIsAddOpen(false);
        }}
      />
    </Screen>
  );
}
