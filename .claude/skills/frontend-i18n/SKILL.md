---
name: frontend-i18n
description: Use when adding or changing any user-facing text in frontend/ (labels, titles, messages, screen titles), touching JSON under src/i18n/locales or src/modules/*/i18n, adding an error code to errorCodeSchema in @airremote/contracts, showing an error to the user, or adding a language.
---

# Translations and error messages

Every text the user sees comes from i18next with typed keys. A missing key,
namespace or error text does not compile.

## Steps for a new text

- [ ] Pick the namespace: the module's own (`modules/<m>/i18n/locales/en/<m>.json`,
      used as `useTranslation('<m>')`), or a global one in
      `src/i18n/locales/en/`: `actions` (button verbs: `retry`, `sign-out`),
      `messages` (the default; `errors.*`) or `screens` (global screens'
      titles) → [i18n and error messages][i18n].
- [ ] Add the key in kebab-case, nested by screen or component
      (`remote-list.empty`, `learn-button.waiting`).
- [ ] Use it: `const { t } = useTranslation('remotes'); t('remote-list.empty')`;
      another namespace: `t('sign-out', { ns: 'actions' })`.
- [ ] New module: `create-new module` makes the JSON; register it in
      `src/i18n/resources.ts` (import + a line in `resources.en`) as its
      "Add by hand:" output says. Until then its keys don't type-check.

## Rules

- Keys are typed from `resources.en` (`src/types/i18n.d.ts`): a wrong key or
  namespace is a compile error → [i18n and error messages][i18n].
- Interpolation is `{{name}}` in the JSON and `t('key', { name })`; plurals
  are `key_one`/`key_other` with `t('key', { count })`. Never build a sentence
  by concatenating strings.
- Form fields show their own i18n texts, never Zod's messages (see
  `src/modules/auth/screens/login-screen/`) → [i18n and error messages][i18n].
- The server's `message` is never shown; errors are shown by `code` →
  [i18n and error messages][i18n].
- `src/i18n` may import only `@modules/<m>/i18n/...`, and only to register a
  namespace → [Layers and import rules][layers].
- Tests don't see real texts: the `t` mock echoes the key (`frontend-testing`).

## Error codes

- Failed requests toast `messages:errors.<CODE>` from the query cache
  (`src/app/notify-api-error.ts`); you don't call it yourself.
  `UNAUTHORIZED` and `INVALID_REFRESH_TOKEN` never toast: the user is taken
  to Login instead (their texts still exist, for screens that show them).
- **Adding a code** to `errorCodeSchema`
  (`packages/contracts/src/errors/errors.contract.ts`) means adding
  `errors.<CODE>` to `src/i18n/locales/en/messages.json` in the same change,
  or `pnpm typecheck` fails (every `ErrorCode` and `ClientErrorCode` needs a
  text) → [i18n and error messages][i18n].
- Generic codes (`INTERNAL_ERROR`, `UNKNOWN_ERROR`, `BAD_REQUEST`,
  `VALIDATION_FAILED`, `INVALID_RESPONSE`) say nothing specific: give the
  mutation a `meta: { errorMessage: t('...') }` in its hook (mutation hooks
  may call `useTranslation`), or a query one at its `useQuery` call site
  (query factories are plain functions).
- An error that isn't an `ApiError` (a device command that settled as
  `failed` or `expired`, with `error.code`) is shown by the screen with the
  same text: ``t(`errors.${code}`, { ns: 'messages' })``.

## Adding a language

- [ ] Add it to `SUPPORTED_LANGUAGE` in `src/i18n/i18n.constants.ts`.
- [ ] Copy every namespace's JSON into `locales/<lng>/`, globally and in every
      module, and translate it.
- [ ] Add `<lng>: { ... }` to `resources` in `src/i18n/resources.ts`, with
      the same namespaces as `en` (types come from `en`).
- [ ] The choice is kept in `preferencesStore.setLanguage()`;
      `useSyncLanguage` in the root navigator applies it. A picker calls the
      store, never `i18next.changeLanguage` → [i18n and error messages][i18n].

## Example

`src/modules/buttons/i18n/locales/en/buttons.json`:

```json
{
  "learn-button": {
    "title": "Learn a button",
    "waiting": "Point your remote at {{device}} and press the button.",
    "learned": "Saved \"{{name}}\"."
  }
}
```

```tsx
const { t } = useTranslation('buttons');
<Text.Paragraph>
  {t('learn-button.waiting', { device: device.name })}
</Text.Paragraph>;
```

In a test this renders `learn-button.waiting | device: Desk`.

## Verify

```bash
pnpm lint && pnpm typecheck && pnpm test:frontend
```

[i18n]: ../../../frontend/ARCHITECTURE.md#i18n-and-error-messages
[layers]: ../../../frontend/ARCHITECTURE.md#layers-and-import-rules
