---
name: frontend-ui
description: Use when creating or changing a component, screen or navigator in frontend/ (src/components, src/screens, src/navigation, src/modules/*/components, src/modules/*/screens, src/modules/*/navigation), touching src/ui or the vendored HeroUI Native kit, styling with Tailwind classes, or reproducing V1's look in the V2 app.
---

# Components, screens and navigators

Screens compose; components render; decisions live in helpers and state in
hooks. Everything visual comes from `@ui` (vendored HeroUI Native) and
Tailwind classes with the theme's tokens.

## Steps

- [ ] Generate it:
      `pnpm --filter @airremote/frontend create-new component <name> [--module <m>]`
      or `create-new screen <name> [--module <m>]`. Each comes with a test and
      an `index.ts`; a screen also gets its title key.
- [ ] Do the screen's "Add by hand:" lines: the `<Stack.Screen>` in the
      module's navigator (title from `t('<name>.title')`) and the route in
      its param list in `src/types/navigation.types.ts`.
- [ ] Need a kit component `@ui` doesn't export yet? Add one line to
      `src/ui/index.ts` (see below).
- [ ] Texts from i18n (`frontend-i18n`), tests (`frontend-testing`), then
      look at it in the browser (`frontend-dev`).

## Rules

- Screens: read route params, call hooks, lay out components, handle the
  loading, empty and error states. No business rules, no `@api` →
  [Layers and import rules][layers].
- Components get data and callbacks through props or hooks, never `@api`;
  decisions (visible? allowed? which label?) are helpers → [Layers][layers].
- One component per file. A sub-component used only by its parent is a flat
  file in the parent's folder; one used elsewhere gets its own folder.
- Props are `type XProps = { ... }` above the component; components,
  screens and navigators are `default` exports → [Naming][naming].
- No barrel for `components/` or `screens/`: import by folder
  (`@modules/auth/screens/login-screen`); navigators by file →
  [Naming][naming].
- Show-or-hide is `{!!condition && <X />}`; a ternary only for either/or;
  nested ternaries become named sub-components.
- Style with `className`: Tailwind's palette and scale with V1's values
  (`bg-gray-100`, `text-green-500`, `px-6`, `max-w-sm`; `src/ui/theme.css`
  makes them Tailwind 3's hex colours, as V1's), the kit's tokens
  (`bg-background`, `bg-accent` is black, `text-danger`), NextUI's
  `rounded-small/medium/large` and `shadow-small/medium`, and
  `font-poppins*` where V1 named Poppins. No arbitrary values (`w-[13px]`)
  unless the scale lacks V1's value (say so in a comment), no hex colours;
  a `<name>.styles.ts` only for what classes can't express →
  [UI kit][ui], [Naming][naming].
- App code imports the kit from `@ui` only; `uniwind`, `tailwind-variants`
  and `tailwind-merge` are for `src/ui` → [Layers and import rules][layers].
- Every screen's root is `Screen` from `@components/screen` (clear of the
  status bar and notch; `hasBottomInset` on screens without the tab bar).
  A signed-in screen then has a `ScrollView` with `px-2` and `TopToolbar`
  (`onBack` on a nested screen) → [Shared components][shared].
- Use the shared chrome before writing your own: `SectionHeader`,
  `NoticeBox`, `TileGrid`, `EmptyTiles` (inside the ScrollView; `onRetry`
  for a failed first load, `isOffline` for one waiting for the network),
  `StatusDot`, `DeleteBadge`, `Wobble`, `FlatSelect`, `BorderedField`,
  `IndeterminateProgress`, and `Modal` from `@ui` for a wizard →
  [Shared components][shared].
- Edit mode: wrap the screen in `EditModeProvider` (`@contexts/edit-mode`),
  read `useEditMode((s) => s.isEditing)`, and stop it on blur:
  `useFocusEffect(useCallback(() => stop, [stop]))`. A tile in edit mode
  wraps itself in `Wobble` and shows a `DeleteBadge` labelled
  "Delete {{name}}"; its outer view is not `overflow-hidden` (the badge
  sits half outside).
- A field names itself: `BorderedField` (and the auth module's
  `StackedField`) link the label with `nativeID` and `aria-labelledby`
  from `useId()`, and show their own error text; use them rather than a
  bare `Input` → [UI kit][ui].
- Busy or disabled controls set `accessibilityState={{ disabled, busy }}`
  for native and `aria-busy` / `aria-disabled` for the browser, which
  ignores `accessibilityState` (`modules/auth/components/submit-button`,
  `modules/remotes/components/press-button`).
- Lists of server data use the query's `isPending` for a first load and a
  module-level empty constant for `data` → [Queries][queries].
- Navigation titles come from i18n (`options={{ title: t(...) }}`); web
  uses them for the tab title.

## `@ui` and the kit

`src/ui/index.ts` is the list of what app code can use (`Text` there is
the kit's `Typography`: `Text.Heading`, `Text.Paragraph`). The kit has more
in `src/ui/heroui/components/` (`list-group`, `chip`, `skeleton`, `select`,
`switch`, `bottom-sheet`, ...). To use one, add a line such as
`export { Chip } from './heroui/components/chip';` to `src/ui/index.ts`.

- `UiProvider` sits inside `SafeAreaProvider` (`src/app/app.tsx`); tests get
  it from `renderWithProviders` → [UI kit][ui].
- `alert.error(message)` and `alert.confirm(options)` (title, message,
  confirm and cancel labels) from `@ui` open V1's Error and Confirmation
  dialogs from anywhere. Failed requests already open the
  Error dialog by code, so don't add your own for those; a delete asks
  first through `DeleteBadge`, which uses `alert.confirm`.
- Pictures are `Image` from `@ui` with a source from `@assets/images`
  (`IMAGES`); icons are `Icon` with a lucide icon (`as`) and a colour class.
  Only `src/ui` imports `expo-image`, `expo-camera` or
  `expo-linear-gradient` → [UI kit][ui].
- **Changing the vendored kit** (`src/ui/heroui/`): it is ours, excluded from
  ESLint and Prettier but type-checked. Keep upstream's formatting, and add
  a numbered entry under "Our changes" in `src/ui/heroui/VENDOR.md` saying
  which file changed and why. Prefer wrapping a kit component in
  `src/components/` over editing the copy → [UI kit][ui].

## Porting V1's look

Every class, colour, size, text and asset of V1's pages is resolved to
values in `docs/superpowers/specs/2026-10-28-v1-look-inventory.md`: start
there. Read the V1 page in `legacy/frontend/src/` only for what the
inventory doesn't cover, for layout and content only; never copy markup,
CSS or code. The app is light-only, as V1 was. V1's pictures are already
in `src/assets/` (`IMAGES`); a new one needs the owner's approval before
it is copied, and nothing may reference `legacy/`. A change to
`src/ui/theme.css` needs the dev server restarted with `--clear`.

## Example: a tile with edit mode (module component)

```tsx
// src/modules/devices/components/device-tile/device-tile.tsx (shortened)
type DeviceTileProps = {
  device: DeviceResponse;
  isEditing: boolean;
  onDelete: (deviceId: string) => void;
};

export default function DeviceTile({
  device,
  isEditing,
  onDelete,
}: DeviceTileProps) {
  const { t } = useTranslation('devices');

  return (
    <Wobble isActive={isEditing}>
      {/* Not clipped: the delete badge sits half outside the corner. */}
      <View className="relative h-40 rounded-lg border-2 border-gray-300 bg-gray-100">
        <View className="h-1/3 p-2">
          <Text
            numberOfLines={1}
            className="text-sm font-semibold text-gray-800"
          >
            {device.name}
          </Text>
          <Text className="text-xs text-gray-600">
            {t(device.online ? 'device-tile.online' : 'device-tile.offline')}
          </Text>
        </View>
        {/* … the picture: Image from @ui with IMAGES.microcontroller … */}
        {isEditing && (
          <DeleteBadge
            position="left"
            label={t('device-tile.delete', { name: device.name })}
            onConfirm={() => onDelete(device.id)}
          />
        )}
      </View>
    </Wobble>
  );
}
```

Full working references: `src/modules/devices/screens/device-list-screen/`
(a list with edit mode, empty and failed states),
`src/modules/remotes/screens/remote-details-screen/` (details, a not-found
state, a wizard, a device command), `src/modules/auth/screens/` (forms).
Check a kit component's props in its `*.types.ts` under
`src/ui/heroui/components/`.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

Then look at it in the browser at phone width (390×844) and next to the
inventory's values (`frontend-dev`).

[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
[naming]: ../../../frontend/ARCHITECTURE.md#naming
[ui]: ../../../frontend/ARCHITECTURE.md#ui-kit
[queries]: ../../../frontend/ARCHITECTURE.md#queries
[shared]: ../../../frontend/ARCHITECTURE.md#shared-components
