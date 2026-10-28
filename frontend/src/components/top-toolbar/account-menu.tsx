import { LogOut, UserPlus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';

import { Icon, Image, Menu } from '@ui';
import { IMAGES } from '@assets/images';

type AccountMenuProps = {
  onLogout: () => void;
};

/**
 * V1's avatar menu: "Invite a friend" (not built in V2, so disabled) and
 * "Logout" in red.
 */
export default function AccountMenu({ onLogout }: AccountMenuProps) {
  const { t } = useTranslation('chrome');

  return (
    <Menu>
      <Menu.Trigger
        accessibilityLabel={t('top-toolbar.account')}
        className="size-10 items-center justify-center"
      >
        <Image source={IMAGES.avatar} contentFit="contain" className="size-8" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content
          presentation="popover"
          placement="bottom"
          align="end"
          className="min-w-50 rounded-large p-1 shadow-medium"
        >
          <Menu.Item isDisabled className="gap-2 rounded-small px-2 py-1.5">
            <Icon as={UserPlus} size={18} colorClassName="text-black" />
            <Menu.ItemTitle className="text-sm font-normal text-black">
              {t('top-toolbar.invite-friend')}
            </Menu.ItemTitle>
          </Menu.Item>
          <Menu.Item
            variant="danger"
            onPress={onLogout}
            className="gap-2 rounded-small px-2 py-1.5"
          >
            <Icon as={LogOut} size={18} colorClassName="text-danger" />
            <Menu.ItemTitle className="text-sm font-normal">
              {t('top-toolbar.logout')}
            </Menu.ItemTitle>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
