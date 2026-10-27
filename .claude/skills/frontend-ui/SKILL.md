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
- Style with `className`: theme tokens (`bg-background`, `text-foreground`,
  `text-muted`, `bg-surface`, `border-border`, `text-danger`, `bg-accent`)
  and Tailwind's scale (`px-6`, `gap-6`, `max-w-sm`). No arbitrary values
  (`w-[13px]`), no hex colours; a `<name>.styles.ts` only for what classes
  can't express → [Naming][naming].
- App code imports the kit from `@ui` only; `uniwind`, `tailwind-variants`
  and `tailwind-merge` are for `src/ui` → [Layers and import rules][layers].
- A `Label` names its field: `nativeID={id}` on the `Label`,
  `aria-labelledby={id}` on the `Input`, `id` from `useId()` → [UI kit][ui].
- Busy buttons: `isDisabled` plus
  `accessibilityState={{ disabled, busy }}` (see the Login screen).
- Lists of server data use the query's `isPending` for a first load and a
  module-level empty constant for `data` → [Queries][queries].
- Navigation titles come from i18n (`options={{ title: t(...) }}`); web
  uses them for the tab title.

## `@ui` and the kit

`src/ui/index.ts` exports `UiProvider`, `toast`, `Button`, `Card`,
`Description`, `Dialog`, `FieldError`, `Input`, `Label`, `Spinner`,
`Surface`, `Text` (the kit's `Typography`: `Text.Heading`, `Text.Paragraph`),
`TextField`, `Toast` and `useToast`. The kit has more in
`src/ui/heroui/components/` (`list-group`, `chip`, `skeleton`, `select`,
`switch`, `bottom-sheet`, ...). To use one, add
`export { Chip } from './heroui/components/chip';` to `src/ui/index.ts`.

- `UiProvider` sits inside `SafeAreaProvider` (`src/app/app.tsx`); tests get
  it from `renderWithProviders` → [UI kit][ui].
- `toast.success()`/`toast.error()` work outside React; failed requests
  already toast by code, so don't add your own for those.
- **Changing the vendored kit** (`src/ui/heroui/`): it is ours, excluded from
  ESLint and Prettier but type-checked. Keep upstream's formatting, and add
  a numbered entry under "Our changes" in `src/ui/heroui/VENDOR.md` saying
  which file changed and why. Prefer wrapping a kit component in
  `src/components/` over editing the copy → [UI kit][ui].

## Porting V1's look

Read the V1 page and components in `legacy/frontend/src/` for layout and
content only; never copy markup, classes, CSS or code. Rebuild with `@ui`
and the tokens; the theme follows the system's light or dark scheme. If a V1
image is needed (an appliance picture per remote type), ask the owner before
copying it into `src/assets/`; nothing may reference `legacy/`.

## Example: a remote tile (module component)

```tsx
// src/modules/remotes/components/remote-tile/remote-tile.tsx
type RemoteTileProps = {
  remote: RemoteResponse;
  onPress: (remoteId: string) => void;
};

export default function RemoteTile({ remote, onPress }: RemoteTileProps) {
  const { t } = useTranslation('remotes');

  return (
    <Card className="gap-2">
      <Text.Heading type="h5">{remote.name}</Text.Heading>
      <Text.Paragraph color="muted">{t(`types.${remote.type}`)}</Text.Paragraph>
      <Button onPress={() => onPress(remote.id)}>
        <Button.Label>{t('tile.open')}</Button.Label>
      </Button>
    </Card>
  );
}
```

Full working references: `src/modules/auth/screens/login-screen/` (form,
labels, busy button) and `src/modules/home/screens/home-screen/`. Check a
kit component's props in its `*.types.ts` under `src/ui/heroui/components/`.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

Then look at it in the browser, at phone width and in dark mode
(`frontend-dev`).

[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
[naming]: ../../../frontend/ARCHITECTURE.md#naming
[ui]: ../../../frontend/ARCHITECTURE.md#ui-kit
[queries]: ../../../frontend/ARCHITECTURE.md#queries
