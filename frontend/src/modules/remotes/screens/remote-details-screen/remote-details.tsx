import { useCallback, useState } from 'react';
import { ScrollView } from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import type { RemotesStackParamList } from '@app-types';
import { useEditMode } from '@contexts/edit-mode';
import ButtonTile from '@modules/remotes/components/button-tile';
import InfoBar from '@modules/remotes/components/info-bar';
import LearnButtonDialog from '@modules/remotes/components/learn-button-dialog';
import { useRemoteDetails } from '@modules/remotes/hooks';
import EmptyTiles from '@components/empty-tiles';
import Screen from '@components/screen';
import SectionHeader from '@components/section-header';
import TileGrid from '@components/tile-grid';
import TopToolbar from '@components/top-toolbar';

import RemoteNotFound from './remote-not-found';

/**
 * The page under its edit-mode provider: the back arrow, V1's info card,
 * "Remote Buttons" with the button tiles (or V1's empty state, "Try again"
 * when a first load failed, or the offline line while one waits for the
 * network), and the Add Button dialog. A remote
 * that is gone shows a not-found state instead.
 */
export default function RemoteDetails() {
  const { t } = useTranslation('remotes');
  const {
    params: { remoteId },
  } = useRoute<RouteProp<RemotesStackParamList, 'RemoteDetails'>>();
  const navigation =
    useNavigation<
      NativeStackNavigationProp<RemotesStackParamList, 'RemoteDetails'>
    >();
  const {
    remote,
    device,
    buttons,
    isLoaded,
    isMissing,
    loadFailure,
    isOffline,
    retry,
    deleteButton,
  } = useRemoteDetails(remoteId);
  const [isLearnOpen, setIsLearnOpen] = useState(false);
  const isEditing = useEditMode((state) => state.isEditing);
  const toggleEditMode = useEditMode((state) => state.toggle);
  const stopEditMode = useEditMode((state) => state.stop);

  // V1 left edit mode with the page; here the screen stays mounted behind
  // the other tabs.
  useFocusEffect(useCallback(() => stopEditMode, [stopEditMode]));

  const goBack = () => {
    navigation.goBack();
  };

  if (isMissing) {
    return (
      <Screen>
        {/* Grows to the screen's height, so the state centres without scrolling. */}
        <ScrollView className="flex-1" contentContainerClassName="grow px-2">
          <TopToolbar onBack={goBack} />
          <RemoteNotFound
            onBack={() => {
              navigation.popTo('RemoteList');
            }}
          />
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView className="flex-1" contentContainerClassName="px-2">
        <TopToolbar onBack={goBack} />
        <InfoBar remote={remote} device={device} />
        <SectionHeader
          title={t('remote-details.heading')}
          // V1 left the badge empty until the remote had loaded.
          count={isLoaded ? buttons.length : undefined}
          onAdd={() => {
            setIsLearnOpen(true);
          }}
          onToggleEdit={toggleEditMode}
        />
        {buttons.length > 0 && (
          <TileGrid>
            {buttons.map((button) => (
              <ButtonTile
                key={button.id}
                button={button}
                isEditing={isEditing}
                onDelete={deleteButton}
              />
            ))}
          </TileGrid>
        )}
        {isLoaded && buttons.length === 0 && (
          <EmptyTiles text={t('remote-details.empty')} />
        )}
        {loadFailure !== null && (
          <EmptyTiles
            text={
              loadFailure === 'remote'
                ? t('remote-details.remote-load-failed')
                : t('remote-details.load-failed')
            }
            onRetry={retry}
          />
        )}
        {isOffline && <EmptyTiles isOffline />}
      </ScrollView>
      <LearnButtonDialog
        isOpen={isLearnOpen}
        remoteId={remoteId}
        onClose={() => {
          setIsLearnOpen(false);
        }}
      />
    </Screen>
  );
}
