// The app's only entry to the UI kit. Re-export a kit component here when a
// screen first needs it; app code never imports `@ui/heroui/...`.
export { UiProvider } from './ui-provider';
export { toast } from './toast';
export { Icon } from './icon';
export { Image } from './image';

export { Button } from './heroui/components/button';
export { Card } from './heroui/components/card';
export { Description } from './heroui/components/description';
export { Dialog } from './heroui/components/dialog';
export { FieldError } from './heroui/components/field-error';
export { Input } from './heroui/components/input';
export { Label } from './heroui/components/label';
export { Spinner } from './heroui/components/spinner';
export { Surface } from './heroui/components/surface';
// The kit's `Text` is a deprecated alias of `Typography`; same component.
export { Typography as Text } from './heroui/components/text';
export { TextField } from './heroui/components/text-field';
export { Toast, useToast } from './heroui/components/toast';
