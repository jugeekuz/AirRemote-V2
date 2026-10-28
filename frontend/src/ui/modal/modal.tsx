import type { ReactNode } from 'react';
import { View } from 'react-native';
import { FadeIn, FadeOut } from 'react-native-reanimated';

import { isWebPlatform } from '@utils/platform';
import { Button } from '@ui/heroui/components/button';
import { Dialog } from '@ui/heroui/components/dialog';
import { cn } from '@ui/heroui/helpers/external/utils';

/**
 * Where the card sits. On phones both stick to the top (V1's NextUI modal);
 * from 640 px `top-center` centres it and `top` stays 64 px from the top.
 */
export type ModalPlacement = 'top' | 'top-center';

type ModalProps = {
  isOpen: boolean;
  /** The backdrop was pressed. */
  onClose: () => void;
  /** @default 'top-center' */
  placement?: ModalPlacement;
  children: ReactNode;
};

// The spacing is the card's margin, not the portal's padding: on web,
// Reanimated pins the entering card at its on-screen position relative to a
// padded parent, which would add the padding twice.
const PORTAL_CLASS: Record<ModalPlacement, string> = {
  top: 'justify-start p-0',
  'top-center': 'justify-start p-0 sm:justify-center',
};

// On web, Reanimated pins an element with a custom (Keyframe) entering
// animation, the kit's default, at `position: absolute` 1 s after it opens,
// measuring from its DOM parent. The card's parent is a `display: contents`
// wrapper, so a centred card dropped half a screen. Reanimated's own fades
// are not pinned.
const CONTENT_ANIMATION = isWebPlatform
  ? { entering: FadeIn.duration(200), exiting: FadeOut.duration(150) }
  : undefined;

/**
 * V1's modal (NextUI's): a white card, 14 px corners, at most 448 px wide,
 * over a 50 % black backdrop. Compose it from `Modal.Header`, `Modal.Body`
 * and `Modal.Footer` with `Modal.Button`s.
 */
function Modal({
  isOpen,
  onClose,
  placement = 'top-center',
  children,
}: ModalProps) {
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal className={PORTAL_CLASS[placement]}>
        <Dialog.Overlay />
        <Dialog.Content
          isSwipeable={false}
          animation={CONTENT_ANIMATION}
          className="m-1 max-w-md rounded-large bg-overlay p-0 shadow-small sm:mx-auto sm:my-16 sm:w-full"
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}

type ModalHeaderProps = {
  children: string;
  /** V1's Error and Confirmation dialogs add 8 px above the title. */
  hasTopMargin?: boolean;
};

/** The title: 18 px semibold, 16 px / 24 px padding; names the dialog. */
function ModalHeader({ children, hasTopMargin = false }: ModalHeaderProps) {
  return (
    <Dialog.Title
      className={cn(
        'px-6 py-4 text-lg font-semibold text-black',
        hasTopMargin && 'mt-2',
      )}
    >
      {children}
    </Dialog.Title>
  );
}

/** The content column: 24 px / 8 px padding, 12 px between children. */
function ModalBody({ children }: { children: ReactNode }) {
  return <View className="gap-3 px-6 py-2">{children}</View>;
}

/** A paragraph of body text: 16 px, black, as V1's `<p>`. */
function ModalText({ children }: { children: string }) {
  return (
    <Dialog.Description className="text-base text-black">
      {children}
    </Dialog.Description>
  );
}

/** The buttons' row, at the end: 24 px / 16 px padding, 8 px apart. */
function ModalFooter({ children }: { children: ReactNode }) {
  return (
    <View className="flex-row justify-end gap-2 px-6 py-4">{children}</View>
  );
}

/**
 * NextUI's buttons as V1 used them: `primary` black (OK, Yes, Next),
 * `secondary` #343434 (No), `danger-light` transparent with red text (Close).
 */
export type ModalButtonVariant = 'primary' | 'secondary' | 'danger-light';

type ModalButtonProps = {
  variant: ModalButtonVariant;
  onPress: () => void;
  isDisabled?: boolean;
  children: string;
};

const BUTTON_CLASS: Record<ModalButtonVariant, string> = {
  primary: 'bg-accent',
  secondary: 'bg-secondary',
  'danger-light': 'bg-transparent',
};

const LABEL_CLASS: Record<ModalButtonVariant, string> = {
  primary: 'text-accent-foreground',
  secondary: 'text-secondary-foreground',
  'danger-light': 'text-danger',
};

/** 40 px tall, at least 80 px wide, 12 px corners, 14 px text. */
function ModalButton({
  variant,
  onPress,
  isDisabled = false,
  children,
}: ModalButtonProps) {
  return (
    <Button
      variant={variant === 'danger-light' ? 'ghost' : 'primary'}
      onPress={onPress}
      isDisabled={isDisabled}
      className={cn('h-10 min-w-20 rounded-medium px-4', BUTTON_CLASS[variant])}
    >
      <Button.Label className={cn('text-sm font-normal', LABEL_CLASS[variant])}>
        {children}
      </Button.Label>
    </Button>
  );
}

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Text = ModalText;
Modal.Footer = ModalFooter;
Modal.Button = ModalButton;

export default Modal;
