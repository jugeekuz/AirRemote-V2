// The app's only entry to the UI kit. Re-export a kit component here when a
// screen first needs it; app code never imports `@ui/heroui/...`.
export { UiProvider } from './ui-provider';
export { toast } from './toast';
export { alert } from './alert';
export type { ConfirmOptions } from './alert';
export { Icon } from './icon';
export { Image } from './image';
export { LinearGradient } from './linear-gradient';
export type { GradientDirection } from './linear-gradient';
export { Modal } from './modal';
export type { ModalButtonVariant, ModalPlacement } from './modal';
export { QrScanner, useCameraAccess } from './qr-scanner';
export type { CameraAccess } from './qr-scanner';
export { Tick } from './tick';
export { TintedSpinner } from './tinted-spinner';

export { Button } from './heroui/components/button';
export { Card } from './heroui/components/card';
export { Description } from './heroui/components/description';
export { Dialog } from './heroui/components/dialog';
export { FieldError } from './heroui/components/field-error';
export { Input } from './heroui/components/input';
export { Label } from './heroui/components/label';
export { Menu } from './heroui/components/menu';
export { Select } from './heroui/components/select';
export { Spinner } from './heroui/components/spinner';
export { Surface } from './heroui/components/surface';
export { Switch } from './heroui/components/switch';
// The kit's `Text` is a deprecated alias of `Typography`; same component.
export { Typography as Text } from './heroui/components/text';
export { TextField } from './heroui/components/text-field';
export { Toast, useToast } from './heroui/components/toast';
