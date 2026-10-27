# Vendored HeroUI Native

This folder is a copy of HeroUI Native's source. We own it: it is not
installed from npm, and the app reaches it only through `@ui`
(`frontend/src/ui/index.ts`).

- Upstream: https://github.com/heroui-inc/heroui-native
- Version: `1.0.11` (tag `v1.0.11`)
- Commit: `1980fbb`
- License: Apache-2.0, see `LICENSE` (copied from the repository root).

## What was copied

Everything under upstream `src/` (`components/`, `primitives/`, `helpers/`,
`providers/`, `styles/`, `optional/` and `index.tsx`), except:

- `src/__tests__/`
- every `*.md` file (component docs beside each component, and
  `primitives/README.md`)

Nothing outside `src/` was copied apart from `LICENSE`: no `example/`,
`docs/`, build or lint config.

The copy is excluded from ESLint and Prettier (root `eslint.config.js` and
`.prettierignore`) and from Jest coverage, but it is type-checked with the
app's `tsconfig.json`. Do not reformat it: keeping upstream's formatting keeps
the diff against a new upstream version readable.

## Import rewrite

Upstream source refers to itself by relative paths. Only the docs import
`from 'heroui-native'`, and they were not copied. At `1.0.11` this check finds
nothing to rewrite, in either the bare or a sub-path form:

```sh
cd frontend/src/ui/heroui
grep -rlE "from 'heroui-native(/[^']*)?'" --include='*.ts' --include='*.tsx' .
```

If a future version imports itself by package name, rewrite each import to a
relative path to the copy's `index.tsx` (run from this folder):

```sh
grep -rlE "from 'heroui-native'" --include='*.ts' --include='*.tsx' . |
  while read -r f; do
    rel=$(realpath --relative-to="$(dirname "$f")" .)
    sed -i "s#from 'heroui-native'#from '$rel/index'#g" "$f"
  done
```

A sub-path import (`'heroui-native/...'`) points at a package export; map it
by hand to the file `package.json` `exports` names. Keep the copy free of our
`@ui` aliases so it stays portable.

## Our changes

Every change to upstream's files, with the reason. Upstream's code is
otherwise unchanged.

1. `components/toast/toast.tsx`: `aria-hidden` on the hidden toast instance
   that only measures the toast's height (after its `{...restProps}`, so the
   spread cannot undo it). Upstream renders the message twice, both with
   `role="status"`, so screen readers announced each toast twice (on web the
   copy is in the accessibility tree too) and tests found two elements for one
   toast. `aria-hidden` maps to `accessibilityElementsHidden` on iOS,
   `importantForAccessibility="no-hide-descendants"` on Android and
   `aria-hidden` on web. Found by `src/ui/toast/toast.test.tsx`.

The web spike (provider, `Card`, `TextField` with `Label` and `Input`,
`Button`, and a success toast in `expo start --web`) needed no change: it
rendered with the kit's styling and no console errors or warnings.

The type-check needed no change either. Upstream's tsconfig sees every
`@types/*` package; ours lists `types`, so `node` (for `NodeJS.Timeout` and
`Error.captureStackTrace`) and `expo/types` (for `import '*.css'`) are listed
in `frontend/tsconfig.json`.

## Set-up outside this folder

- `frontend/src/ui/global.css` imports Tailwind, Uniwind and
  `./heroui/styles/index.css`, and adds the `@source` paths.
- `frontend/metro.config.js` wraps Expo's config with Uniwind's
  `withUniwindConfig`, which writes `frontend/src/ui/uniwind-types.d.ts`
  (generated, committed). Without Metro:
  `pnpm exec uniwind generate-artifacts --css ./src/ui/global.css --dts ./src/ui/uniwind-types.d.ts`.
- `frontend/jest.setup.ts` and `frontend/jest.resolver.js` make the kit's
  native dependencies work under Jest.
- The optional peers the kit loads with `require` in `optional/`
  (`expo-blur`, `@gorhom/bottom-sheet`, `react-native-screens`) are installed.

## How to update

1. Clone upstream at the new tag and note its commit.
2. Delete this folder's contents except `VENDOR.md`, then copy the new `src/`
   over it, without `__tests__/` and `*.md` files, and copy `LICENSE`:
   `rsync -a --exclude='__tests__' --exclude='*.md' <clone>/src/ frontend/src/ui/heroui/`
3. Run the import check above; rewrite anything it finds.
4. Re-apply every change under "Our changes" (or drop one that upstream has
   fixed), and update the version and commit at the top.
5. Compare upstream's `package.json` peer and dev dependencies with
   `frontend/package.json` and update what changed (`pnpm expo install` for
   the Expo-managed ones, then pin exact versions).
6. Run `pnpm typecheck` and `pnpm test:frontend` (the toast and smoke tests in
   `frontend/src/ui/`), then the web check: render a `Card`, a `TextField`
   and a `Button` that shows a toast in `pnpm --filter @airremote/frontend web`
   and confirm the styling, the toast and a clean console.
