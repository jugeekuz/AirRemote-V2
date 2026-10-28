# V1 web frontend: design and behaviour inventory

Source: `legacy/frontend/` (Vite 5 + React 18 + NextUI 2 (`@nextui-org/react ^2.4.6`, theme
`@nextui-org/theme 2.2.9`) + Tailwind 3.4.7 + lucide-react ^0.424 + @dnd-kit).
Purpose: rebuild Login, Sign up, Devices, Remotes and Remote details in the V2 Expo app
(Uniwind + vendored HeroUI Native) so they look as close to V1 as possible.

How values were resolved: `legacy/frontend/tailwind.config.js` was copied to a scratch folder
(with `require("@nextui-org/react")` → `require("@nextui-org/theme")`), built with
`tailwindcss@3.4.7` + `@nextui-org/theme@2.2.9` over the legacy sources, and checked with
`resolveConfig` and the NextUI `tv()` slot functions for the exact props V1 uses. Every class
token in the files below was checked against the generated CSS (section 14 lists those that
produce nothing).

Conventions in this file: `file:line` are relative to `legacy/frontend/src/` unless noted.
1 Tailwind spacing unit = 4 px. Colours are Tailwind **v3** hex values. Uniwind uses Tailwind 4,
whose default palette is OKLCH and differs slightly. To match V1, use the hex values below, not
the v4 names.

---

## 0. Global facts that affect everything

### 0.1 `index.html`
- `index.html:6`: `<meta name="viewport" content="width=device-width, initial-scale=0.9, maximum-scale=0.9" />`.
  **On phones V1 renders everything at 90 %.** A 16 px V1 value shows as about 14.4 device-independent
  pixels. Two ways to match it: multiply every px value in this file by 0.9, or use the px values as
  written and accept that V2 is about 11 % larger. Decide once and apply it everywhere. The rest of
  this file gives the raw CSS px.
- `index.html:5`: favicon `/logo.svg` (`public/logo.svg`, the same two-parallelogram mark as
  `assets/icons/airremote-logo-short.svg`, 164×171).
- `index.html:7`: title `AirRemote`.
- Fonts loaded from Google Fonts (`index.html:8-11`, plus `index.css:1`): Roboto 400/500/700,
  Poppins 300/400/500/600, Playfair Display 400/700, Fredoka 400–700.
  **But the main typeface is not Roboto.** Every page uses `font-sans`, or no family class at all,
  and that is Tailwind's system stack: `ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
  "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"`. In RN, use the platform default font
  (SF Pro / Roboto). Poppins appears only in `EmptyTiles`, `Loading` and the device tile's "!" badge;
  Roboto only in the desktop Sidebar labels.

### 0.2 `tailwind.config.js` (resolved)
- Screens: `xs 480`, `sm 640`, `md 768`, `lg 1024`, `xl 1280`, `2xl 1920`, `3xl 2600` px.
- `extend.fontFamily`: `roboto`, `poppins`, `fredoka`, `playfair`.
- `extend.scale`: `110`=1.10, `105`=1.05.
- `extend.gridTemplateColumns`: 14…20 columns.
- `extend.colors`: **confirmed**. `primary` = `{ light: #ffffff, DEFAULT: #000000, dark: #000000 }`
  and `secondary` = `{ light: #ffffff, DEFAULT: #343434, dark: #343434 }`. Resolved utilities:
  `.bg-primary` → `rgb(0 0 0)`, `.text-primary` → `#000`, `.border-b-primary` → `#000`,
  `.bg-primary/20` → `rgb(0 0 0 / .2)`, `.bg-secondary` → `rgb(52 52 52)`, `.text-secondary` → `#343434`.
  The override only replaces `DEFAULT`. **`primary-foreground` and `secondary-foreground` are still
  NextUI's `#ffffff`**, and the shade utilities (`bg-primary-50` etc.) are still NextUI blue variables.
  As a result, every NextUI `color="primary"` component is **black with white text**
  (Button, Progress bar, the default Spinner), and `color="secondary"` buttons are **#343434 with
  white text**.
- `extend.height`: `100dvh` = `100dvh`.
- Keyframes / animations (`tailwind.config.js:55-90`):
  - `pop`: `0% scale(1)`, `30% scale(1.2)`, `50% scale(1.1)`, `65% scale(1.2)`, `100% scale(1)`;
    `animation: pop 0.9s ease-in-out infinite`.
  - `shake`: `0% rotate(1deg)`, `50% rotate(-1.5deg)`, `100% rotate(1deg)`;
    `animation: shake 0.2s infinite ease-in-out`.
  - `shakeSm`: 0.5deg / -0.75deg / 0.5deg, 0.2 s. It is defined but not used on these pages.
- `darkMode: "class"`, and V1 never turns it on, so it is **light mode only**.
- The NextUI plugin also adds `border-1` = 1px, `border-small/medium/large` = 1/2/3 px,
  `rounded-small/medium/large` = 8/12/14 px, `text-tiny/small/medium/large` = 12/14/16/18 px
  (line-height 16/20/24/28), `transition-width` (`width 250ms ease`), `scale-85`, etc.

### 0.3 NextUI light-theme tokens (resolved from `:root,.light`)
| Token | Hex | Token | Hex |
|---|---|---|---|
| background / content1 | #ffffff | foreground / content1-fg | #11181c |
| default-50 | #fafafa | default-100 / content2 | #f4f4f5 |
| default-200 / content3 | #e4e4e7 | default (=300) / content4 | #d4d4d8 |
| default-400 | #a1a1aa | default-500 / foreground-500 | #71717a |
| default-600 | #52525b | default-700 | #3f3f46 |
| default-800 | #27272a | default-900 | #18181b |
| default-foreground | #000000 | focus (outline) | #006fee |
| danger | #f31260 | danger-foreground | #ffffff |
| success | #17c964 | success-foreground | #000000 |
| overlay | #000000 | divider | #111111 at 15 % opacity, 1 px |
| warning | #f5a524 | NextUI primary var (unused by `bg-primary`) | #006fee |

Radii: small 8, medium 12, large 14 px. Hover opacity 0.8, disabled opacity 0.5.
Shadows: `shadow-small` = `0 0 5px 0 rgb(0 0 0/.02), 0 2px 10px 0 rgb(0 0 0/.06), 0 0 1px 0 rgb(0 0 0/.3)`;
`shadow-medium` = `0 0 15px 0 rgb(0 0 0/.03), 0 2px 30px 0 rgb(0 0 0/.08), 0 0 1px 0 rgb(0 0 0/.3)`.

### 0.4 Tailwind v3 values used (reference)
- Font sizes / line heights: `text-xs` 12/16, `text-sm` 14/20, base 16/24, `text-lg` 18/28,
  `text-xl` 20/28, `text-2xl` 24/32. Weights: normal 400, medium 500, semibold 600.
- Radii: `rounded-md` 6, `rounded-lg` 8, `rounded-xl` 12, `rounded-3xl` 24, `rounded-full` 9999.
- Shadows: `shadow-sm` `0 1px 2px 0 rgb(0 0 0/.05)`; `shadow-md` `0 4px 6px -1px rgb(0 0 0/.1),
  0 2px 4px -2px rgb(0 0 0/.1)`; `shadow-2xl` `0 25px 50px -12px rgb(0 0 0/.25)`.
  `shadow-<colour>` swaps the shadow's colour for that colour at **full opacity**: for example
  `shadow-md shadow-gray-700` = `0 4px 6px -1px #374151, 0 2px 4px -2px #374151`.
- Preflight default border colour: `#e5e7eb` (gray-200). It applies wherever a `border*` class has no colour.
- Colours: white #ffffff, black #000000, gray-50 #f9fafb, gray-100 #f3f4f6, gray-200 #e5e7eb,
  gray-300 #d1d5db, gray-400 #9ca3af, gray-500 #6b7280, gray-600 #4b5563, gray-700 #374151,
  gray-800 #1f2937, gray-950 #030712, green-50 #f0fdf4, green-100 #dcfce7, green-200 #bbf7d0,
  green-500 #22c55e, green-600 #16a34a, green-800 #166534, blue-500 #3b82f6, blue-700 #1d4ed8,
  red-400 #f87171, red-500 #ef4444.
- `backdrop-blur-md` 12 px, `backdrop-blur-2xl` 40 px.

### 0.5 `index.css`
- `index.css:7-16`: `@keyframes custom-ping { 75%,100% { transform: scale(2); opacity: 0 } }`,
  `.animate-custom-ping { animation: custom-ping 1s cubic-bezier(0,0,.2,1) infinite }`. **Not used on these pages.**
- `index.css:18-20`: `.remove-child-border > div { border-width: 0 !important }`. This is how the
  login/sign-up "grouped fields" look is made (see 2.2).

### 0.6 NextUI component defaults used (resolved for V1's exact props)
**Button** (`size md`, `variant solid` unless noted): `h-10` 40 px, `px-4` 16 px, `min-w-20` 80 px,
`gap-2` 8 px, `rounded-medium` 12 px, `text-small` 14/20, `font-normal`, whitespace-nowrap.
Pressed `scale(0.97)`; hover `opacity .8` (solid) and focus-visible outline 2 px #006fee offset 2.
- `color="primary"`: bg #000000, text #ffffff.
- `color="secondary"`: bg #343434, text #ffffff.
- `color="danger" variant="light"`: transparent bg, text #f31260, hover bg `danger/20`.
- `isIconOnly` (default colour): `w-10 h-10 min-w-10 px-0`, bg #d4d4d8, text #000.

**Input** (`variant="bordered"`, `size md`, label inside):
- base `flex flex-col w-full`.
- inputWrapper `h-14` 56 px, `min-h-10`, `px-3` 12, `py-2` 8, `border-medium` 2 px #e4e4e7,
  hover #a1a1aa, focused #000000, `rounded-medium` 12, `shadow-sm`, flex-col, justify-center.
- label 14/20, #71717a. When filled or focused it scales to 0.85 and moves up. `isRequired` appends
  `*` in #f31260 with 2 px left margin.
- input text 14/20, normal weight, placeholder #71717a.
- `isInvalid`: border, label and text all #f31260 (`!border-danger`); errorMessage 12/16 #f31260
  in a helper row with `p-1` (4 px).
- `color="success"`: label #17c964, focused border #17c964 (the unfocused border stays #e4e4e7).
- description 12/16 #a1a1aa.

**Select** (default `variant flat`, md, label inside): trigger `h-14 min-h-14` 56 px, `px-3`,
`py-2`, bg #f4f4f5, hover #e4e4e7, `rounded-medium` 12, `shadow-sm`. Label 14/20 #71717a, scaling
to 0.85 when filled. Value 14/20, #71717a when empty and #000 when filled. Chevron icon 16×16 at
`right-3`, rotated 180° when open. The listbox sits in a popover (`p-1`, max-h 256 px).

**Modal**: wrapper `fixed inset-0 h-[100dvh] w-screen`; on mobile `items-start` (sticks to the
top). From `sm` up, `placement="top-center"` centres vertically and `placement="top"` stays at the top.
Card: `bg-content1` #fff, `rounded-large` 14, `shadow-small`, `max-w-md` 448 px, `w-full`,
margins `mx-1 my-1` (4 px) on mobile and `sm:mx-6 sm:my-16`.
Backdrop: `bg-overlay/50` = rgba(0,0,0,.5).
Header: `py-4 px-6` (16/24), `text-large` 18/28, `font-semibold`, `flex`.
Body: `px-6 py-2` (24/8), `flex-col gap-3` (12). The text inside inherits 16/24 and colour #000.
Footer: `px-6 py-4`, `flex-row gap-2` (8), `justify-end`.
Close (×) button: `absolute top-1 right-1` (4 px), `p-2`, colour #71717a, `rounded-full`, hover bg #f4f4f5.
Open/close is NextUI's framer-motion scale+fade (about 0.3–0.4 s).

**Spinner**: md = 32×32 wrapper, lg = 40×40. Two stacked rings with `border-3` (3 px) and only the
bottom border coloured: one solid ring `spinner-spin 0.8s ease infinite`, one dotted ring at opacity
.75 `0.8s linear infinite`. Default colour primary = **#000000**. `color="default"` = #d4d4d8.
An invalid colour (V1's `color='blue'`) falls back to primary, so it is black.

**Progress** (`size="sm" isIndeterminate`): track `h-1` 4 px, `rounded-full`, bg #d4d4d8 at 50 %.
The indicator is `bg-primary` = **black**, rounded, with `indeterminate-bar 1.5s
cubic-bezier(.65,.815,.735,.395) infinite` (`translateX(-50%) scaleX(.2)` → `translateX(100%) scaleX(1)`).

**Snippet** (`size="lg" color="default"`): `px-4 py-2`, `rounded-large` 14, bg #d4d4d8 at 40 %,
text #000, mono font. V1's `text-xs` className overrides `text-medium`, so the text is 12/16.
A copy button sits at the right and its icon swaps to a check when copied.

**Tooltip** (`color="danger"`): content `px-2.5 py-1` (10/4), 14/20, bg #f31260, text #fff,
`rounded-large` 14, `shadow-medium`.

**Dropdown / Menu**: popover content bg #fff, `rounded-large` 14, `shadow-medium`, `p-1`,
`min-w-[200px]`. Item: `px-2 py-1.5` (8/6), `gap-2`, `rounded-small` 8, title 14/20 normal.
Hover bg #d4d4d8 with #000 text. `color="danger"` items hover to #f31260 with #fff text.

**Divider**: 1 px, #111111 at 15 % opacity.

---

## 1. Shared chrome

### 1.1 `App.jsx` (root layout and routing)
- `App.jsx:35`: root `flex flex-col sm:flex-row w-screen h-100dvh sm:px-0 bg-white`. White page,
  column on mobile, row on desktop (sidebar plus content).
- Routes (`App.jsx:39-69`): `/` Dashboard, `/remotes` Remotes, `/remotes/:remoteName` RemoteButtons,
  `/devices` Devices, `/automations` Automations (all private, wrapped in `<Navigation>`);
  `/sign-up`, `/login` and `/oauth2/callback` are public. Private routes without auth redirect to
  `/login`; public routes with auth redirect to `/`.
- `PrivateRoute` (`App.jsx:96-105`): while the startup refresh runs it shows
  `<Loading text="Hang tight — we’re verifying your info..."/>` (curly apostrophe U+2019, em dash).
- `<Navigation>` (`App.jsx:77-94`): Sidebar (desktop), page, NavigationBar (mobile), then a spacer
  `div.flex.mb-16.sm:mb-0` (64 px bottom space on mobile so content clears the fixed bar).
- Keep-alive pings (`App.jsx:28-30`, `useKeepAlive`): POSTs to `${apiUrl}/keep-alive` ×6 every 15 s,
  `${baseUrl}/wss/keep-alive` ×1 every 15 s and `${authUrl}/keep-alive` ×1 every 10 s, only while
  the tab is visible. These warmed AWS Lambdas. **Not needed in V2.**

### 1.2 `NavigationBar.jsx` (mobile bottom tab bar, hidden at `sm`+)
- Container `NavigationBar.jsx:14`: `fixed sm:hidden bottom-0 flex bg-white border-1 h-16 w-full shadow-md z-10`
  plus an inline `boxShadow: '0 -1px 6px -1px rgba(0, 0, 0, 0.1)'`. The inline style replaces
  `shadow-md`, so the shadow is an upward soft shadow. Height 64 px, white, 1 px #e5e7eb border on
  all sides (preflight colour), z 10.
- List `:15`: `flex justify-around items-center py-2 w-full` (8 px vertical padding).
- Item `:29`: `Link` `flex flex-col items-center`. Active `text-green-500` (#22c55e), inactive
  `text-gray-500` (#6b7280), `hover:text-green-500`. Label `:31`: `text-xs font-normal` (12/16, 400).
  Active rule: path includes `to` (and `to !== "/"`), or path is exactly `/` for Dashboard.
- Items (`App.jsx:87-90`), in order:
  1. Dashboard: lucide `LayoutDashboard` size 20, strokeWidth 1.7.
  2. Remotes: `assets/icons/remote.svg` with `w-[20px] h-[20px] stroke-current stroke-2 rotate-45`
     (20×20, rotated 45°; the svg has `fill="currentColor"`, so it follows the active/inactive colour).
  3. Devices: lucide `Usb` 20 / 1.7.
  4. Automations: lucide `CalendarCog` 20 / 1.7.
  (V2 will probably have only Remotes and Devices; keep the same item styling.)

### 1.3 `Sidebar.jsx` (desktop only, brief)
- `Sidebar.jsx:11` `hidden sm:block tems-center min-w-16 mr-2 z-[11] h-screen` (`tems-center` is a typo).
- `:12` `fixed h-screen w-16|w-64 transition-width` (64 px collapsed, 256 px expanded, 250 ms).
- `:13` nav `bg-gradient-to-l from-white to-gray-50 border-r shadow-sm`.
- `:14` header `border-b p-4 flex justify-between items-center`; the logo `airremote-logo.svg` is
  `w-[10rem] h-12` when expanded and `w-0 opacity-0 h-0` when collapsed; the toggle button is
  `p-1.5 rounded-lg hover:bg-gray-100` with lucide `ChevronFirst`/`ChevronLast` (24).
- Item `:41-48`: `relative z-10 flex justify-center items-center py-2 px-2 my-1 ml-[2px] w-full h-10
  font-medium rounded-lg`. Active `bg-gradient-to-tr from-green-200 to-green-100 text-green-800`;
  inactive `hover:bg-green-50 text-gray-800`. Label `:50`: `w-52 ml-3` / `w-0 opacity-0`,
  `font-roboto font-medium text-gray-700`.
- Icons (`App.jsx:80-83`): LayoutDashboard 20/1.7; `remote-access.svg` `w-6 h-6 stroke-current stroke-[0.2]`;
  Usb 20/1.7; CalendarCog 20/1.7.

### 1.4 `TopToolbar.jsx` (page header row on every private page)
- `TopToolbar.jsx:18`: `flex justify-between items-center h-16 w-full p-3`. 64 px tall, 12 px padding.
- Left (`:19-26`):
  - Nested route (more than one path segment, i.e. `/remotes/:name`): back button `:20`
    `flex justify-center items-center w-8 h-8 rounded-md bg-gray-50 cursor-pointer` (32×32,
    radius 6, #f9fafb) holding lucide `ArrowLeft` at its default 24 px / stroke 2, black.
    Tapping it runs `navigate(-1)`.
  - Otherwise: `assets/icons/airremote-logo-short.svg` `w-10 h-10` (40×40, black two-parallelogram
    mark). Tapping it runs `navigate('/')`.
- Right (`:28-67`): NextUI `Dropdown`. The trigger is `Button isIconOnly className="bg-transparent w-7"`
  holding `assets/icons/avatar.svg` `w-8 h-8` (32×32 grey-blue circle with a person silhouette).
  tailwind-merge keeps `min-w-10`, so the trigger is effectively 40×40 with a transparent background.
  Menu (`aria-label="Dynamic Actions"`):
  - `Invite a friend`, startContent lucide `UserPlus` 18. Opens `ModalAddUser`.
  - `Logout`, `className="text-danger" color="danger"` (#f31260 text; on hover red bg with white
    text), startContent lucide `LogOut` 18. Calls `POST {authUrl}/logout` and then `setToken(null)`.
- `logoImg` (`assets/imgs/logo.png`) is imported at `:9` but never used.

### 1.5 Page header row (Devices / Remotes / Remote details share it)
- Row `Devices.jsx:107` (same in `Remotes.jsx:112` and `RemoteButtons.jsx:117`):
  `flex justify-between items-center flex-row mt-6 mb-3 ml-2`. Margins: 24 px top, 12 px bottom, 8 px left.
- Title `Devices.jsx:109`: `font-sans font-medium text-xl mb-[1px]` (20/28, weight 500, 1 px bottom
  margin; the RemoteButtons title has no `mb-[1px]`, `RemoteButtons.jsx:119`).
- Count badge `Devices.jsx:112`: `flex justify-center items-center ml-2 rounded-lg w-6 h-6 bg-green-600`
  (24×24, radius 8, #16a34a, 8 px left margin). Number `:113`: `font-sans text-center text-white text-xs`
  (12/16, white). Shows `length` or 0. On RemoteButtons it renders empty while the remote is loading.
- Right side `Devices.jsx:121`: `pr-3` (12 px) wrapping `<Toolbar>` with the add-modal trigger as its child.

### 1.6 `Toolbar.jsx` (the "+ | ✎" pill)
- `Toolbar.jsx:11`: `flex items-center justify-between rounded-3xl h-8 w-23 bg-gray-100 border-1 border-gray-300 shadow-xs shadow-gray-200 px-2`.
  It is a 32 px tall pill, radius 24, bg #f3f4f6, 1 px #d1d5db border, 8 px horizontal padding.
  `w-23` and `shadow-xs` do not exist in Tailwind 3, so the width is content-sized and there is no
  shadow (`shadow-gray-200` alone does nothing).
- `:13` slot for the add trigger: `flex w-7 h-7 items-center justify-center rounded-full bg-gray-100` (28×28 circle, same grey as the pill).
  The child is lucide `CircleFadingPlus` (size 19, stroke 2, black, on Devices/Remotes; size 18 on RemoteButtons).
- `:19` separator: `h-5 w-px bg-gray-300 mx-2` (1×20 px, #d1d5db, 8 px each side).
- `:21` lucide `Pencil` size 18, strokeWidth 2, colour black, `cursor-pointer mx-[3px]`. Tapping it
  runs `toggleEditMode`. **The pencil does not change when edit mode is on**: there is no active
  state and no "Done" label.

### 1.7 `NoticeBox.jsx` (Devices and Remotes only, under the header row)
- `NoticeBox.jsx:5` outer: `flex w-full min-h-12 p-1 pr-2 -mt-1` (min-height 48, padding 4 with 8 on the right, top margin −4).
- `:6` box: `flex w-full h-full items-center justify-start rounded-md bg-green-100 bg-opacity-50 border-2 border-green-500 py-1`.
  Colours: bg rgba(220,252,231,.5), 2 px #22c55e border, radius 6, 4 px vertical padding.
- `:7` icon: lucide `BadgeAlert` size 23, `fill="#22c55e"`, `color='#ffffff'` (a green badge with a white "!"), `ml-2 mr-2` (8 px each side).
- `:8` text: `text-xs font-medium text-gray-700` (12/16, 500, #374151).
- Copy (both pages): **"If the device loses connection it will take up to 10 minutes to show up as disconnected."**

### 1.8 `EmptyTiles.jsx` (empty state)
- `EmptyTiles.jsx:5`: `flex flex-col justify-center items-center w-full h-screen`, followed by a spacer
  `:10` `h-1/2`. The text block therefore sits in the upper-middle of a full-screen-tall area.
- `:7` title: `text-lg font-semibold font-poppins` (18/28, Poppins 600).
- `:8` line: `text-sm text-gray-500 flex items-center font-poppins` (14/20, #6b7280, Poppins 400):
  **"Click the [CircleFadingPlus 16px, mx-1] icon to get started."** (the icon is inline, 4 px each side).
- Copy: Devices **"No devices available"**, Remotes **"No remotes available"**,
  Remote details **"No remote buttons available"**.
- **V1 has no loading state for lists.** While the GET is in flight `data` is null, so the empty
  state and a count of 0 show until the data arrives.

### 1.9 `Loading.jsx`
- `Loading.jsx:5`: `flex w-full h-full justify-center items-center`; `:6` `flex flex-col justify-center items-center text-center`.
- `:7` `<Spinner size="lg" color='blue' />`. `blue` is not a NextUI colour, so it falls back to
  primary: a **black** 40×40 spinner.
- `:8` text `text-lg font-medium font-poppins mt-5` (18/28, Poppins 500, 20 px top margin).
- Used with "Hang tight — we’re verifying your info..." during the startup token refresh.

### 1.10 Contexts
- `EditModeContext.jsx`: `{ editMode: boolean (initially false), toggleEditMode() }`. Each page wraps its
  content in its own `EditModeProvider`, so edit mode resets on navigation.
- `DraggingContext.jsx`: `{ dragging, setDragging }`. While any tile is being dragged, every tile
  stops shaking.
- `AuthContext.jsx`: holds the `id_token`; refreshes once on mount (`POST {authUrl}/refresh-token`,
  withCredentials). An axios interceptor adds `Authorization: Bearer`. On a 401 whose message is
  `'Unauthorized'` or `'The incoming token has expired'` it refreshes and retries once; if the
  refresh fails it sets the token to null (back to login). `username` is decoded from the token's
  `nickname` claim but is not shown on these pages.

---

## 2. Login (`pages/Login.jsx`)

### 2.1 Layout (mobile first)
```
[ full-height page, content centred vertically and horizontally ]
  column, min-width 90% of the viewport (70% sm, 60% md, 50% lg, 30% xl, 20% 2xl)
    AirRemote wordmark (256 wide)
    "Log in to your account to continue"            (grey, 14)
    ── 20 px ──
    ┌ Email *              ┐  grouped field box,
    ├ Password *        👁 ┤  1 px grey border, 12 px outer radius
    └──────────────────────┘
    ── 24 px ──
    [        Log In        ]   blue gradient, 40 tall, radius 12
    ── 20 px ──
    ──────────  OR  ──────────
    ── 20 px ──
    [ G  Continue with Google ]  outlined, 40 tall
    ── 8 px ──
    Need to create an account? Sign Up
```

### 2.2 Classes and values
- `Login.jsx:44` page: `flex w-full min-h-screen justify-center items-center`.
- `:45` column: `flex flex-col items-center justify-center min-w-[90%] sm:min-w-[70%] md:min-w-[60%] lg:min-w-[50%] xl:min-w-[30%] 2xl:min-w-[20%]`.
- `:48` logo block: `flex flex-col justify-center items-center text-start w-full`.
- `:49` logo: `assets/icons/airremote-logo.svg` with `w-64 h-16 -ml-9`. The box is 256×64 px. The
  svg (viewBox 3508×696, an embedded 3361×696 PNG at x=10) keeps its aspect ratio, so the wordmark
  draws about **256×51 px**, vertically centred in the 64 px box. `-ml-9` (−36 px) shifts the
  centred item **about 18 px left of centre**. The art is a black "AirRemote" wordmark in a heavy
  geometric sans with the two-parallelogram mark on the left; there is no colour.
- `:50` subtitle: `text-sm text-gray-500 -mt-2` (14/20, #6b7280, −8 px top margin). Copy:
  **"Log in to your account to continue"**.
- `:56` form section: `flex-col w-full my-5` (20 px top and bottom; `flex-col` alone does nothing).
  `:57` form: `flex-col w-full`.
- `:58-67` Email `Input`: `isRequired`, `type="email"`, `label="Email"`, `placeholder="Enter your email"`,
  `variant="bordered"`, `autoComplete="email"`,
  `className="border-1 rounded-t-xl remove-child-border hover:border-gray-400 focus-within:border-gray-400"`.
- `:69-87` Password `Input`: `isRequired`, `type` password/text, `label="Password"`, `placeholder="Enter your password"`,
  `variant="bordered"`, `autoComplete="password"`,
  `className="border-1 border-t-0 rounded-b-xl remove-child-border hover:border-gray-400 hover:border-t-1 focus-within:border-t-1 focus-within:border-gray-400"`.
  endContent `:78`: `<button className="focus:outline-none">` toggling an eye icon
  (`EyeFilledIcon` / `EyeSlashFilledIcon`, inline 24×24 viewBox SVGs at `:125-179`, `fill=currentColor`)
  with `text-2xl text-default-400 pointer-events-none` (24 px, #a1a1aa). Shows "eye" when the password
  is hidden and "eye-slash" when it is visible.
- **How the grouped fields look:** `className` goes on the Input's base div. `remove-child-border`
  sets the inner 2 px NextUI border to 0, so the only border is the base div's `border-1`: 1 px
  #e5e7eb (the preflight default colour). The first field has 12 px top corners; the second has no
  top border and 12 px bottom corners. The result is one 112 px tall box split by a single 1 px line.
  On hover or focus that field's border turns #9ca3af, and the second field also gains its 1 px top
  border, which darkens the dividing line. The inner wrapper is still 56 px tall with 12 px padding,
  `rounded-medium` and `shadow-sm` (a very faint inner shadow). The floating label is 14 px #71717a
  with a red `*`. Input text is 14 px.
- `:89-95` submit `Button type="submit" color="primary" className="w-full mt-6 bg-gradient-to-tr from-blue-500 to-blue-700"`:
  full width, 24 px top margin, 40 px tall, radius 12, **gradient to top-right #3b82f6 → #1d4ed8**
  (the gradient image covers the black `bg-primary`), white 14 px normal text **"Log In"**.
  Loading: the label is replaced by `<Spinner/>` (md 32 px, **black** rings on the blue button).
- `:101` OR row: `flex flex-row w-full justify-between items-center mb-5` (20 px bottom).
  `:102,106` `Divider className="max-w-[40%]"` (1 px #111 at 15 %). `:103` `text-sm text-gray-500` **"OR"**.
- `:109` `flex flex-col w-full`; `:110` Google `Button color="primary" className="w-full bg-transparent border-2 border-gray-200 text-gray-600"`:
  transparent, 2 px #e5e7eb border, text #4b5563 14 px, 40 tall, radius 12, gap 8.
  Content: `assets/icons/google-logo.svg` `w-5` (20 px, the four-colour "G") and **"Continue with Google"**.
  A Facebook button is commented out (`:113-115`).
- `:118` `mt-2` (8 px); `:119` `text-sm text-gray-500 font-normal` **"Need to create an account? "** plus
  a link span `cursor-pointer font-medium text-blue-500 hover:text-blue-700` **"Sign Up"** (#3b82f6, 500)
  that navigates to `/sign-up`.

### 2.3 Behaviour
- Submit (`:25-41`): if email or password is empty it silently returns (the browser's native
  `required` / `type=email` validation also runs). It sets `loginLoading` and calls
  `POST {authUrl}/login {email, password}` with `withCredentials`. On success it stores
  `res.data.id_token`, and PublicRoute redirects to `/`.
- **Error:** `alert(error.response.data.message)` or `alert(error.message)`. That is the browser
  alert; there is no inline error.
- Google: `initiateOAuthFlow("Google")` redirects to Cognito `/oauth2/authorize` (scope `profile email openid`).
- Login also pings `${authUrl}/login/keep-alive` ×6 every 1 s while visible (`:16`).

---

## 3. Sign up (`pages/SignUp.jsx`)

### 3.1 Layout
Same shell as Login: wordmark, subtitle, four grouped fields, button, footer link. There is **no
OR row and no Google button** (commented out at `:158-173`).

### 3.2 Classes and values
- `:72` page, `:73` column, `:76-81` logo and subtitle: identical to Login (`:44-53`). Subtitle copy:
  **"Create an account to get started"**.
- `:84` `flex-col w-full mt-5` (20 px top margin only); `:85` form `flex-col w-full`.
- Fields (all `isRequired`, `variant="bordered"`, `remove-child-border`, `hover:border-gray-400`,
  `focus-within:border-gray-400`, and `hover:border-t-1 focus-within:border-t-1` on fields 2–4):
  1. `:86-96` **Username**: `type="username"` (not a real type, so it behaves as text),
     placeholder "Enter your username". Valid: `border-1 rounded-t-xl`; invalid: `border-2 !border-red-400`
     (2 px #f87171) plus NextUI `isInvalid` (label and text #f31260).
  2. `:97-107` **Email**: `type="email"`, "Enter your email". Valid `border-1 border-t-0`; invalid `border-2 !border-red-400`.
  3. `:108-127` **Password**: password/text, "Enter your password", eye toggle as on Login. Valid `border-1 border-t-0`; invalid as above.
  4. `:128-147` **Confirm password**: "Confirm your password", its own eye toggle, valid `border-1 border-t-0 rounded-b-xl`.
  `rounded-t-xl` (field 1) and `rounded-b-xl` (field 4) sit outside the condition, so they apply in
  both states. An invalid field drops `border-t-0` and gets a full 2 px red border on all four
  sides, which stands out from the grouped box. **No error message text is shown**; only the red
  border and the red label.
- `:148-154` submit: same as Login (`w-full mt-6 bg-gradient-to-tr from-blue-500 to-blue-700`), label
  **"Sign Up"**, `<Spinner/>` while loading.
- `:175-177` footer `mt-2`, **"Already have an account? "** plus `font-medium text-blue-500 hover:text-blue-700` **"Log In"**, which navigates to `/login`.

### 3.3 Validation (`:26-49`, runs on submit)
- Username `/^[a-zA-z0-9_.]{1,32}$/` (note the `A-z` typo, which also allows ``[\]^_` ``).
- Email `/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/`.
- Password `/^[a-zA-Z0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]{1,64}$/` (1–64 printable ASCII without spaces).
- Password ≠ confirmation: both the password and the confirm field go invalid.
- Bug: the `isValid*` flags are never set back to true, so a field stays red after the user fixes it.
- Success: `POST {authUrl}/signup {nickname: username, email, password}`, then `navigate('/login')`
  with no message. Error: `alert(message)`. `ModalError` is rendered but never triggered.

---

## 4. Devices (`pages/Devices.jsx`)

### 4.1 Layout
```
TopToolbar  [logo]                                   [avatar ▾]
Header row  Your Devices (●N)                      ( + | ✎ )
NoticeBox   [!] If the device loses connection …
Grid        ┌ tile ┐ ┌ tile ┐     2 columns on phones (<480 CSS px)
            └──────┘ └──────┘
(or EmptyTiles "No devices available")
```
- `Devices.jsx:103` page container: `px-2 sm:px-0 w-full overflow-x-hidden overflow-y-scroll` (8 px side padding on mobile; vertical scroll).
- Title **"Your Devices"** (capital D). The count badge shows `deviceData.length`.
- Toolbar child: `ModalAddDevice` (its trigger is `CircleFadingPlus` 19 px).
- Grid: `TileGrid` holding a `TileDevice` per device. `isConnected = !!device.connectionId`.

### 4.2 `TileGrid.jsx`
- `TileGrid.jsx:81-88`: `w-full grid grid-rows-2 grid-cols-2 gap-2 p-1 pr-2 xs:grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-10 2xl:grid-cols-15 3xl:grid-cols-17`.
  That is 2 columns below 480 CSS px (every phone in portrait; with the 0.9 viewport a 430 pt phone
  is 478 CSS px), 3 from 480, 4 from 640, and so on. Gap 8 px, padding 4 px (8 px right).
  `grid-rows-2` makes the first two rows equal height; tile heights are fixed, so it has no visible
  effect.
- Drag (dnd-kit; **V2 will not build reordering**): MouseSensor activates after 8 px of movement;
  TouchSensor after a 300 ms long-press with 8 px tolerance; KeyboardSensor too. Tiles can only be
  dragged in edit mode, by their grip handle. The original tile fades to opacity 0.3. The
  DragOverlay copy (`:92`) uses `shadow-[0px_2px_5px_rgba(0,0,0,0.4)] shadow-gray-500 scale-105 rounded-lg`
  (shadow `0 2px 5px #6b7280`, scale 1.05). When edit mode is turned off, a changed order is POSTed
  to `/devices/sort` (or `/remotes/sort`, `/remotes/{name}/buttons/sort`) as `{ newOrder: [...] }`.

### 4.3 `TileDevice.jsx`
- Card `TileDevice.jsx:78`: `relative bg-gray-100 rounded-lg border-gray-300 h-[10rem] select-none border-2` plus `animate-shake` in edit mode.
  160 px tall, radius 8, 2 px #d1d5db border, solid #f3f4f6 background.
  Inline style: the dnd transform/transition, `zIndex 100|auto`, `opacity .3|1`, and
  `animationDelay: Math.random()*0.133 s` (`:49-52`, recomputed on every render).
- Inner `:95` `flex flex-col w-full h-full overflow-hidden`.
- Top third `:96`: `relative flex flex-col h-1/3 w-full items-start justify-start p-2 z-10` (8 px padding).
  - `:111` `flex flex-col w-full items-start justify-center`.
  - `:112` name `text-sm font-semibold text-gray-800` (14/20, 600, #1f2937), showing `item.deviceName`.
  - `:113-124` status row `flex flex-row`: `text-xs font-normal text-gray-600` (12/16, #4b5563)
    **"Connected"** or **"Disconnected"**, followed by a status dot `w-[10px] ml-[2px] mb-[2px]`
    (10 px, 2 px left and bottom margin): `active.svg` (green) or `inactive.svg` (red).
  - Edit-mode grip `:98-108`: `absolute top-2 right-2 z-10 flex justify-center items-center rounded-md w-10 h-10 border-1 border-gray-300 bg-gray-50 ml-2 shadow-sm shadow-gray-200`
    (40×40, radius 6, #f9fafb, 1 px #d1d5db, shadow `0 1px 2px #e5e7eb`) holding lucide `Grip` 15 / 2.5;
    `hidden` outside edit mode.
- Bottom two-thirds `:130`: `relative flex h-2/3 w-full items-end justify-end overflow-visible`
  holding an image layer `:56-61`: `absolute inset-0 bg-no-repeat bg-cover bg-center z-0 -ml-3` with
  inline `backgroundImage: url(microcontroller3.png)`, `backgroundSize: 'auto 100%'` and
  `backgroundPosition: 'bottom left'`. The inline style beats `bg-cover bg-center`. The image fills
  the bottom area's height (about 107 px minus borders), anchored bottom-left and shifted 12 px left.
  It is `assets/imgs/microcontroller3.png` (252×175, a purple/pink 3-D chip on a PCB).
- **"Finish setup" badge** `:81-93`: shown when `item.macAddress === "FF:FF:FF:FF:FF:FF"` (a device
  created in the app that has not connected yet). A circle
  `flex justify-center items-center absolute top-0 right-3 -translate-y-1/2 rounded-full bg-red-500 w-[25px] h-[25px]`
  (25 px, #ef4444, centred on the top border, 12 px from the right) with `text-white font-normal font-poppins` "!".
  It is wrapped in a `Tooltip color="danger"` **"Connect this device to finish setup."**, opened on
  hover or mouse-down and closed after 2 s. **Not applicable in V2** (a device row only exists after enrollment).
- Edit mode: `TileDelete position="left"` (see 7.1), deleting `DELETE {apiUrl}/devices/{macAddress}`.
- Tapping a device tile does nothing (no details page).

### 4.4 Data and API
- `GET {apiUrl}/devices` → `response.data.body` = `[{ deviceName, macAddress, connectionId?, orderIndex, … }]`.
- Order: from `orderIndex`; reordering POSTs `{apiUrl}/devices/sort {newOrder}`.
- Errors: `useFetchMemo` sets `error.response.statusText` or `error.message`, which opens `ModalError` (7.3).

### 4.5 `ModalAddDevice.jsx` (3-step wizard; V1 provisioning, **replaced in V2**, see section 9)
- Trigger `:94`: lucide `CircleFadingPlus` 19 / 2 black. When it opens, `GET {apiUrl}/deviceToken` → `{deviceToken}` (refetched every time the modal closes).
- `Modal placement="top-center"`; header **"Add device"** (`:102`); `ModalBody`.
- Footer: steps 1–2 show `Button color="danger" variant="light"` **"Close"** and `Button color="primary"` **"Next"**;
  step 3 shows only `Button color="primary"` **"Finish"**.
- **Step 1** `:136-148` (`w-full -mt-1`, inner `-mt-1 -mb-1`): `font-medium mb-2` **"Steps to connecting your device"**, then
  `ol.list-decimal ml-6 mt-1 mb-2` (24 px indent), each item with a `font-medium` lead-in:
  1. **"Prepare the Device: "**"If your device is not brand new, press the reset button to put it in reset mode. The device's light will blink continuously when it's ready."
  2. **"Connect to WiFi: "**"The device will act as a temporary WiFi hotspot (web server). Connect to its WiFi network, named AirRemote."
  3. **"Enter Device Credentials: "**"A setup page (captive portal) will open automatically. If it doesn't appear on Apple devices, open a browser and go to captive.apple.com."
  4. **"Save Your Authentication Key & Endpoints: "**"During setup, you'll receive a unique authentication key. Make sure to copy it, as you'll need to enter it later."
- **Step 2** `:150-164`: `div.flex.mb-3` **"Select a name for the new device"**, then `Input type="deviceName" label="Device Name" variant="bordered"`
  `className="max-w-xs"` (320 px). `isInvalid` when the value does not match `/^[a-zA-Z0-9- ]+$/`;
  `color` is default when empty, `danger` when invalid and **`success` when valid (green label)**;
  `errorMessage="Please enter a valid device name"`. **Next** is ignored while the value is empty or invalid.
- **Step 3** `:166-183` (`max-w-lg`): `flex mb-3` **"Copy the credentials below and save them somewhere safe, as you'll need to provide them when setting up the device."**;
  label `font-medium` **"WSS Host"** with `Snippet size="lg" symbol="" color="default" className="text-xs min-w-full text-wrap"` showing `VITE_WSS_URL` without `wss://`;
  **"WSS URL"** with a snippet `${VITE_STAGE}/`; **"Authentication key"** with a snippet showing the token (or "Error Loading Token");
  then `flex mt-3 mb-3` **"Follow the instructions previously mentioned to finish setting up the device"**.
- **Finish**: an empty name or token calls `setError("Device name and token can't be empty.")`;
  otherwise `POST {apiUrl}/devices {deviceName, token}`, then refetch and close. Any error closes the wizard, resets it to step 1 and opens ModalError.

---

## 5. Remotes (`pages/Remotes.jsx`)

### 5.1 Layout
Same as Devices: TopToolbar, header **"Your remotes"** (lowercase r) with a count, Toolbar with
`ModalAddRemote`, the NoticeBox (same copy), then the grid of `TileRemote` or EmptyTiles
**"No remotes available"**. Container `Remotes.jsx:108` `px-2 sm:px-0 w-full overflow-x-hidden overflow-y-scroll`;
title block `:113` `flex items-center justify-center`.

### 5.2 `TileRemote.jsx`
- Card `:96`: `relative bg-gray-100 bg-opacity-60 rounded-lg border-gray-300 h-[10rem] select-none border-2` plus `animate-shake` in edit mode.
  160 px, radius 8, 2 px #d1d5db, bg **rgba(243,244,246,.6)** (lighter than the device tile). Same inline style and random delay as the device tile.
- Inner `:99` `flex flex-col w-full h-full justify-between overflow-hidden`.
- Top `:100`: `relative flex flex-col min-h-[33%] w-full items-start justify-start p-2 z-10`.
  - name `:116` `text-sm font-semibold text-gray-800` showing `item.remoteName`.
  - row `:117-123` `flex flex-row`: category `text-xs font-normal text-gray-600` (e.g. "Air Conditioner") followed by a status dot `w-[10px] ml-[2px] mb-[2px]`
    (`active.svg` when the remote's device has a `connectionId`, otherwise `inactive.svg`).
  - edit-mode grip `:102-112`: identical to the device tile.
- Bottom `:128`: `relative flex flex-col h-2/3 w-full items-end justify-end overflow-visible`:
  - Image `TileImg` `:71-80`: wrapper `w-full h-full flex justify-start items-center overflow-hidden z-0`,
    `<img>` `h-full max-w-full object-contain object-left-bottom` plus a per-category offset.
    Category → image (`:82-90`):
    | V1 category | file | px | depicts | extra class |
    |---|---|---|---|---|
    | Air Conditioner | `imgs/air-white-side.png` | 328×226 | white wall-split AC, side view | – |
    | Dehumidifier | `imgs/dehumidifier-white.png` | 345×254 | white portable dehumidifier (cropped) | `-ml-2` |
    | Smart TV | `imgs/tv.png` | 500×421 | black flat-screen TV on a stand | – |
    | Heater | `imgs/heater2.png` | 982×701 | white panel convector heater | – |
    | Audio System | `imgs/speakers.png` | 600×427 | pair of white studio monitors, yellow cones | `-ml-1` |
    | RGB Lights | `imgs/rgb-strip.png` | 537×384 | reel of rainbow LED strip | – |
    | Generic Device | `imgs/universal-device.png` | 628×448 | white DIN-rail relay module with screw terminals | – |
  - "Open" button `:132-136`: an absolute wrapper `absolute flex h-full justify-end items-end` (it
    lands bottom-right through the parent's `items-end`) holding a circle
    `flex justify-center items-center cursor-pointer rounded-full w-14 h-14 bg-gray-200 shadow-md shadow-gray-700 border-gray-300 border-1 bg-opacity-70 backdrop-filter backdrop-blur-2xl mr-2 mb-2`.
    It is a **56 px circle**, bg rgba(229,231,235,.7), 1 px #d1d5db border, 40 px backdrop blur,
    shadow `0 4px 6px -1px #374151, 0 2px 4px -2px #374151` (a dark grey drop shadow), 8 px from
    the right and bottom edges. Inside is lucide `ChevronRight` size 28, colour #374151, `opacity-95`.
    **Only the chevron icon is clickable** (`navigate(`/remotes/${item.remoteName}`)`); the rest of the tile does nothing.
- Edit mode: `TileDelete position="left"`, deleting `DELETE {apiUrl}/remotes/{remoteName}`.

### 5.3 Data and API
- `GET {apiUrl}/remotes` → `[{ remoteName, category, macAddress, orderIndex, buttons? }]`; `GET {apiUrl}/devices` (for the status dot: match on `macAddress`, then check `connectionId`).
- Reordering: `POST {apiUrl}/remotes/sort {newOrder}`.

### 5.4 `ModalAddRemote.jsx` (3-step wizard)
- Trigger: `CircleFadingPlus` 19 / 2. `Modal placement="top-center"`, header **"Add Remote"** (capital R).
- Footer: steps 1–2 show **"Close"** (danger light) and **"Next"** (primary black); step 3 shows **"Create"** (primary).
  Next does nothing (silently) until the step has a value.
- **Step 1** `:163-178`: `p.mb-4` **"Select remote category:"** and `Select label="Select an option" className="max-w-xs"` with items in this order:
  Air Conditioner, Audio System, Dehumidifier, Heater, RGB Lights, Smart TV, Generic Device.
- **Step 2** `:180-195`: **"Select IoT device that will use this remote:"** and a `Select label="Select an option"` listing every `deviceName`.
- **Step 3** `:197-211`: `flex mb-3` **"Select a name for the new remote"** and `Input type="remoteName" label="Remote Name" variant="bordered" className="max-w-xs"`,
  regex `/^[a-zA-Z0-9- ]+$/`, colour default/danger/success as in 4.5, `errorMessage="Please enter a valid button name"` (sic: "button").
- **Create**: `POST {apiUrl}/remotes {remoteName, category, macAddress (of the chosen device), buttons: []}`, then refetch, close and reset. An error opens ModalError.

---

## 6. Remote details (`pages/RemoteButtons.jsx`, route `/remotes/:remoteName`)

### 6.1 Layout
```
TopToolbar  [← back]                                 [avatar ▾]
InfoBar     ┌────────────── black card, 176 tall ──────────────┐
            │ [appliance photo]            Living Room AC      │
            │                              Air Conditioner     │
            │ ─────────────────────────────────────────────── │
            │ Desk ESP32                    Connected ●        │
            │ AA:BB:CC:DD:EE:FF                                │
            └──────────────────────────────────────────────────┘
Header row  Remote Buttons (●N)                      ( + | ✎ )
Grid        ┌ button tile ┐ ┌ button tile ┐   (no NoticeBox on this page)
```
Container `RemoteButtons.jsx:101` `px-2 sm:px-0 w-full overflow-x-hidden overflow-y-scroll`.
Title **"Remote Buttons"**. Empty state: **"No remote buttons available"**.

### 6.2 `InfoBar.jsx`
- Wrapper `InfoBar.jsx:101` `p-1` (4 px).
- Card `:102-105`: `flex justify-center align-center flex-col w-full bg-gray-950 rounded-md p-4 shadow-2xl h-[11rem] xl:h-60`.
  bg **#030712**, radius 6, padding 16, **height 176 px** (240 from xl), shadow `0 25px 50px -12px rgb(0 0 0/.25)`.
- Top row `:108-112`: `flex justify-between items-center flex-row h-[55%]` (`sm:px-4 md:px-8 lg:px-12` on wider screens).
  - Left: the category image, a `relative flex flex-row items-start overflow-hidden w-full h-full` box
    with an `absolute inset-0 bg-no-repeat … z-0` layer, inline `backgroundSize: 'auto 100%'` and
    `backgroundPosition: 'bottom left'`. The image takes the row's full height, anchored bottom-left.
    Category → image (`:91-99`), all photographed on black or dark tones:
    | category | file | px | depicts | offset |
    |---|---|---|---|---|
    | Generic Device | `imgs/generic-device-blue.png` | 481×378 | blue DIN-rail controller with a red 7-seg display | `ml-1` |
    | Air Conditioner | `imgs/airconditioner-black-side.png` | 800×408 | black wall-split AC | – |
    | Dehumidifier | `imgs/dehumidifier-black.png` | 500×444 | black dehumidifier with a green "65%" ring | `ml-1` |
    | RGB Lights | `imgs/rgb-strip.png` | 537×384 | rainbow LED strip reel | `-mb-2` |
    | Audio System | `imgs/speakers-black.png` | 500×419 | pair of black monitors, white woofers | `ml-1` |
    | Heater | `imgs/heater-black.png` | 500×383 | black oil-filled radiator | `ml-1` |
    | Smart TV | `imgs/tv-gray.png` | 600×493 | thin dark TV on a stand | `-mb-1 ml-1` |
  - Right `:117`: `flex flex-col text-nowrap`:
    - remote name `:118` `font-sans font-semibold text-white text-xl lg:text-2xl` (20/28, 600, white).
    - category `:124` `font-sans font-normal text-gray-500 text-sm lg:text-md` (14/20, #6b7280; `lg:text-md` does nothing).
- Divider `:133`: `w-full h-0 bg-black shadow-2xl shadow-white border border-gray-800 my-1`. It draws a
  **2 px line in #1f2937** (1 px top plus 1 px bottom border) with 4 px vertical margin and a
  **white glow** under it (`0 25px 50px -12px #ffffff`, faint on the black card).
- Bottom row `:136-140`: `flex items-center justify-between flex-row h-[45%]`:
  - left `:141` `flex flex-col ml-1`: device name `font-sans font-semibold text-white text-lg lg:text-2xl` (18/28, 600) and MAC address `font-sans font-normal text-gray-500 text-sm lg:text-md` (14/20, #6b7280).
  - right `:154` `flex items-center mr-1`: `font-sans font-semibold text-white text-lg lg:text-2xl`
    **"Connected"** or **"Disconnected"**, followed by a `div.w-3.ml-1` (12 px dot, 4 px gap) using `active.svg` or `inactive.svg`.
- While loading, each field shows **"Loading.."** (two dots), and `isConnected` stays false (so
  "Disconnected") until the device is fetched.

### 6.3 `TileRemoteButton.jsx`
- Card `:48`: `relative bg-gray-100 rounded-lg border border-gray-300 h-32 p-1 select-none` plus `animate-shake` in edit mode.
  **128 px tall**, radius 8, **1 px** #d1d5db border (thinner than the device/remote tiles), #f3f4f6, 4 px padding. Same random delay.
- `:51` `flex flex-col w-full h-full`.
- Top half `:53` `flex h-1/2 w-full items-center justify-between`:
  - grip `:55-62`: `flex justify-center items-center cursor-pointer rounded-md w-8 h-8 border-1 border-gray-300 bg-gray-50 ml-2` (32×32, radius 6). It is **always visible** on this tile, but dragging only works in edit mode. lucide `Grip` 15 / 2.5.
  - `RemoteButton` (6.4) on the right.
- Bottom half `:68` `flex h-1/2 w-full align-items justify-between` (`align-items` does nothing):
  - `:70` `flex flex-col justify-center items-left text-left ml-2` (`items-left` does nothing):
    - `:71` `font-sans font-normal text-xs text-gray-500` **"State"** (when `buttonState === "YES"`) or **"Stateless"**.
    - `:72` `font-sans font-medium text-sm text-gray-800` showing `buttonName` (14/20, 500, #1f2937).
- Edit mode: `TileDelete` with **no position**, so the badge sits at the top-right corner (7.1), deleting
  `DELETE {apiUrl}/remotes/{remoteName}/buttons/{buttonName}`.

### 6.4 `RemoteButton.jsx` (the press control)
- Circle `:82-89`: `flex flex-row justify-center items-center cursor-pointer rounded-full w-9 h-9 bg-gray-50 shadow-md mr-2`
  (36×36, #f9fafb, `shadow-md`, 8 px right margin), plus
  - `border-2 border-green-500` (2 px #22c55e) in every state **except loading**, and
  - `animate-pop` in the success state.
- States (`renderButton`, `:49-58`):
  - **idle**: lucide `Power` size 17, colour #22c55e, strokeWidth 2.5. **Only the icon has the click
    handler** (`:56`), not the whole circle.
  - **loading**: `<Spinner size="md" color="default" />`, a 32 px spinner with **#d4d4d8** rings inside the
    now borderless 36 px circle.
  - **success**: `CheckBoxAnimation` (`:100-141`), an inline SVG `viewBox="0 0 130.2 130.2"` `w-7 h-7` (28×28) with one
    `<polyline points="100.2,40.2 51.5,88.8 29.8,67.5" fill="none" stroke="#22c55e" strokeWidth="9" strokeLinecap="round" strokeMiterlimit="10">`.
    CSS: `stroke-dasharray: 1000`, `animation: dash-check 0.8s ease-in-out forwards`,
    `animation-delay: -0.5s` (= −0.8/1.6), keyframes `stroke-dashoffset 1000 → 2000`.
    The polyline is 99.2 units long (68.8 for the long arm, 30.4 for the short one).
    **What it looks like in practice:** the animation starts at 62.5 % of its timeline. The tick stays
    invisible for about 125 ms, then draws **from the short arm's left end (29.8,67.5), through the
    vertex (51.5,88.8), up to (100.2,40.2)** over about 175 ms, decelerating. It is complete at about
    300 ms and then holds. At the same time the circle runs `animate-pop`
    (scale 1 → 1.2 at 30 % → 1.1 at 50 % → 1.2 at 65 % → 1, 0.9 s ease-in-out, cut off at 0.8 s), keeping its green border.
    After **800 ms** (`successAnimationTimeout`) it returns to idle.
    (To rebuild: animate the visible stroke length 0 → 99.2 between about 125 ms and 300 ms with an
    ease-out curve, starting from the end of the path; scale the circle 1→1.2→1.1→1.2→1 over 0.8 s.)
  - **error**: it goes straight back to idle and opens its own `Modal placement="top"`: header **"Error"**
    (`flex flex-col gap-1 mt-2`), body `<p>{message}</p>`, footer `Button color="primary"` **"Close"**.
- Messages: default "Unexpected Error Occured." (sic). WebSocket timeout:
  **"Timeout reached without response from remote end."** Socket error:
  **"Unexpected error occured during websocket connection with remote end."** Any other reply: the raw `event.data` JSON string.
- Press flow (`services/websocket.js`): `GET {apiUrl}/websocketJwt` → `JSON.parse(body).jwt`; open
  `${VITE_WSS_URL}?deviceType=client&jwt=…`; send `{action:"cmd", cmd:"execute", remoteName, buttonName}`;
  success when the reply has `action === "ack"`; timeout **22 000 ms**.

### 6.5 `ModalAddButton.jsx` (5-step learn wizard)
- Trigger `:123` `<div onClick>` holding `CircleFadingPlus` 18 / 2 black. `Modal placement="top-center"`.
- Header: **"Add Button"** on steps 1–4 and empty on step 5 (the header padding stays).
- Footer: hidden on steps 1 and 5; steps 2–4 show **"Close"** (danger light) and **"Next"** (primary).
- **Step 1** `:161-177`: `p.mb-4` **" Does your remote have a screen?"** (with a leading space) and `Select label="Select an option" className="max-w-xs"` with **Yes** (`YES`) and **No** (`NO`).
  Choosing a value **advances immediately**: Yes goes to step 2, No to step 3.
- **Step 2** `:179-193` (Yes only):
  - `mb-1` "Remotes that have screens on them showing the state of the device (e.g., Air Conditioners) send the entire device's state on each button press."
  - a centred `Divider className="w-3/4"`
  - `mt-2` "It is advised that you:" followed by `ul.list-disc ml-6 mt-1 mb-2`: "Set the desired state on the remote" / "Press the power off button" / "Save the power on button"
  - a centred Divider (w-3/4)
  - `mt-2` "The entire state will be saved and on button press the device will power on in that exact state."
- **Step 3** `:195-209`: `flex mb-3` **"Select a name for the new button."** and `Input type="buttonName" label="Button Name" variant="bordered" className="max-w-xs"`,
  regex `/^[a-zA-Z0-9- ]+$/`, colour default/danger/success, `errorMessage="Please enter a valid button name"`. Next is blocked while the value is empty or invalid.
- **Step 4** `:211-217`: `mb-3` "When the device starts blinking, point your remote to the IR receiver and press the button." /
  `my-3` "The device should blink faster if the read was successful." / `mt-3` "Press next when you're ready."
- **Step 5** `:219-229`: `mb-4` "Point your remote at the device and press the button." and a
  `Progress size="sm" isIndeterminate aria-label="Loading..." className="max-w-md"` (a **black** 4 px indeterminate bar).
  Entering step 5 sends over the WebSocket `{action:"cmd", cmd:"read", remoteName, buttonName: trimmed, buttonState: "YES"|"NO"}`.
  If the reply has `action === "ack"`, the wizard closes, resets and refetches the remote.
  If there is no reply within **30 000 ms**, the wizard closes silently, and the WebSocket timeout
  separately opens ModalError with "Timeout reached without response from remote end."
  An error reply closes the wizard and opens ModalError with the raw message.
- Closing the modal at any step before 5 resets it to step 1.

### 6.6 Data and API
- `GET {apiUrl}/remotes/{remoteName}` → `{ remoteName, category, macAddress, buttons: [{ buttonName, buttonState: "YES"|"NO" }] }`.
- `GET {apiUrl}/devices/{macAddress}` → `{ deviceName, macAddress, connectionId? }` (for the InfoBar).
- Reordering: `POST {apiUrl}/remotes/{remoteName}/buttons/sort {newOrder}`.

---

## 7. Shared overlays

### 7.1 `TileDelete.jsx` (edit-mode delete badge and confirmation)
- Badge position wrapper `:51`: `absolute z-[200] top-0 transform -translate-y-1/2`, plus
  - `position="left"` (device and remote tiles): `-translate-x-1/4 left-0`. The 32 px wrapper (badge
    plus margin) moves 8 px left, so the badge straddles the **top-left corner**.
  - no position (button tiles): `translate-x-1/2 right-0`. The badge straddles the **top-right corner** (centre about 4 px inside the right edge).
- Badge `:52`: `flex justify-center items-center cursor-pointer rounded-full w-6 h-6 bg-gray-300 shadow-sm shadow-gray-500 mr-2 border-1 border-gray-300 opacity-80 backdrop-filter backdrop-blur-md`.
  A 24 px circle in #d1d5db with 1 px #d1d5db border, the whole badge at **80 % opacity**, shadow `0 1px 2px #6b7280`, 12 px blur.
  It holds lucide `X` size 14, colour #000000, strokeWidth 2.5.
- Tapping it opens `Modal placement="top"`:
  header **"Confirmation"** (`flex flex-col gap-1 mt-2`, so 8 px extra top margin),
  body `<p>` **"Are you sure you want to delete this item?"**,
  footer: `Button color="primary"` **"Yes"** (black) **then** `Button color="secondary"` **"No"** (#343434). Yes is on the left.
- Yes: `DELETE url` and then the parent refetch; the modal closes immediately (no loading state). An error opens ModalError with `statusText`.

### 7.2 Edit mode, summarised
- Toggled by the Toolbar pencil and scoped to the page.
- All tiles get `animate-shake` (rotate +1° → −1.5° → +1°, a 0.2 s loop, ease-in-out) with a random
  `animation-delay` of 0–133 ms each, so they wobble out of phase. The shake pauses while something is dragged.
- Device and remote tiles show the 40 px grip at top-right and the delete badge at top-left. Button
  tiles show the delete badge at top-right; their 32 px grip is always there.
- The tiles' normal actions (open chevron, Power) still work in edit mode.

### 7.3 `ModalError.jsx` (the generic error)
- `Modal placement="top"`; header **"Error"** (`flex flex-col gap-1 mt-2`); body `<p>{error}</p>`;
  footer `Button color="primary"` **"OK"** (black).
- Driven by `useError`: `setError(str)` opens it when the string is non-empty and changes. Setting
  the same string again does not reopen it.
- The strings are raw transport text: the HTTP `statusText` (e.g. "Not Found", "Internal Server Error"),
  axios messages ("Network Error"), WebSocket raw JSON, or the fixed WebSocket strings above.
- Login and Sign up use `window.alert()` instead.

### 7.4 `ModalAddUser.jsx` (TopToolbar → "Invite a friend")
- `Modal placement="top-center"`; header **"Add new user"**; body `-mt-1 -mb-1`, then `flex flex-col justify-start w-full mb-3` with
  `font-normal text-foreground-500` (#71717a) **"Provide permission to user to access the app"**, then
  `Input type="userEmail" label="User's Email" variant="bordered" className="max-w-xs"`, regex `/^[\w\.-]+@[a-zA-Z\d\.-]+\.[a-zA-Z]{2,}$/`,
  colour default/danger/success, errorMessage **"Please enter a valid user email"**.
- Footer: **"Close"** (danger light) and **"Add User"** (primary). Add User sends `POST {authUrl}/registeruser {userEmail}` and closes immediately.

---

## 8. Assets used by these pages

| Asset (`src/assets/…`) | Size | Depicts | Where |
|---|---|---|---|
| `icons/airremote-logo.svg` | viewBox 3508×696 (embedded PNG 3361×696) | black "AirRemote" wordmark plus the two-parallelogram mark | Login/SignUp logo (256×64 box), Sidebar (expanded) |
| `icons/airremote-logo-short.svg` (= `public/logo.svg`) | 164×171 | the mark alone: two black parallelograms stacked diagonally (a lightning-like "Z") | TopToolbar left (40×40), favicon |
| `icons/avatar.svg` | viewBox 53×53 | slate-blue circle (#556080) with a light grey (#E7ECED) person silhouette | TopToolbar account trigger (32×32) |
| `icons/google-logo.svg` | viewBox 262×262 | Google four-colour "G" | Login Google button (20 px wide) |
| `icons/active.svg` | viewBox 256×256 | glossy lime-green dot (gradient #64b236→#95db1b, highlight #cff9af) | status dot (10 px on tiles, 12 px on the InfoBar) |
| `icons/inactive.svg` | viewBox 256×256 | glossy red dot (gradient #bf1d1d→#820b0b, highlight #f9a0a0) | status dot |
| `icons/remote.svg` | viewBox 512×512, `fill=currentColor` | remote with wifi arcs above it | mobile bottom nav "Remotes" (20 px, rotated 45°) |
| `icons/remote-access.svg` | viewBox 24×24 | outlined remote with wifi arcs | desktop Sidebar "Remotes" |
| `imgs/microcontroller3.png` | 252×175 | purple/pink 3-D chip on a PCB | every device tile |
| `imgs/air-white-side.png` | 328×226 | white split AC | remote tile: Air Conditioner |
| `imgs/dehumidifier-white.png` | 345×254 | white dehumidifier | remote tile: Dehumidifier |
| `imgs/tv.png` | 500×421 | black TV on a stand | remote tile: Smart TV |
| `imgs/heater2.png` | 982×701 | white panel heater | remote tile: Heater |
| `imgs/speakers.png` | 600×427 | white studio monitors | remote tile: Audio System |
| `imgs/rgb-strip.png` | 537×384 | RGB LED strip reel | remote tile and InfoBar: RGB Lights |
| `imgs/universal-device.png` | 628×448 | white DIN relay module | remote tile: Generic Device |
| `imgs/airconditioner-black-side.png` | 800×408 | black split AC | InfoBar: Air Conditioner |
| `imgs/dehumidifier-black.png` | 500×444 | black dehumidifier, green 65 % ring | InfoBar: Dehumidifier |
| `imgs/tv-gray.png` | 600×493 | dark TV on a stand | InfoBar: Smart TV |
| `imgs/heater-black.png` | 500×383 | black oil radiator | InfoBar: Heater |
| `imgs/speakers-black.png` | 500×419 | black monitors | InfoBar: Audio System |
| `imgs/generic-device-blue.png` | 481×378 | blue DIN controller with a red LED display | InfoBar: Generic Device |
| `imgs/logo.png` | 114×116 | the short mark (PNG) | imported in TopToolbar, unused |

All the PNGs have transparent backgrounds (RGBA).
lucide-react icons (`lucide-react-native` has the same names): LayoutDashboard, Usb, CalendarCog,
ChevronFirst/ChevronLast, ArrowLeft (24/2), UserPlus (18), LogOut (18), Pencil (18/2), CircleFadingPlus
(19, 18, 16), Grip (15/2.5), ChevronRight (28, #374151), X (14/2.5), Power (17/2.5, #22c55e),
BadgeAlert (23, fill #22c55e, stroke #fff).
`assets/lotties/*` (checkbox, spinners, error) are **not used** by these pages: the tick is the inline SVG in 6.4.

---

## 9. V1 features vs the V2 backend

V2 routes (from `openapi.json` and `backend/src/app.ts`): `GET /health`, `POST /users/register`,
`POST /auth/login|refresh|logout`, `GET|POST /devices`, `GET /remotes`, `POST /devices/{deviceId}/remotes`,
`GET|POST /remotes/{remoteId}/buttons`, `POST /buttons/{buttonId}/press`, `GET /device-commands/{id}`.
Every error is `{ error: { code, message, details? } }`, with the codes from `errorCodeSchema`. Lists
are sorted by `lower(name), id`. Ids are UUIDs. Every route except register, login, refresh, logout
and health needs `Authorization: Bearer <accessToken>`; without it the answer is 401 `UNAUTHORIZED`.

| V1 feature (page) | V2 status | V2 route / contract | Notes |
|---|---|---|---|
| Email/password login (Login) | **Supported** | `POST /auth/login` `{email (≤254), password (1–128)}` → 200 `{accessToken, tokenType:'Bearer', expiresIn: 600}` and the `refresh_token` cookie (httpOnly, SameSite=strict, path `/auth`, 7 days) | `401 INVALID_CREDENTIALS`, `400 VALIDATION_FAILED`. Show errors by code, not `alert()`. |
| Google sign-in (Login) | **Not supported** | – | No OAuth in V2: drop the OR row and the Google button, or show them disabled. |
| Session restore on start ("verifying your info") | **Supported** | `POST /auth/refresh` (cookie only, no body) → same body as login | `401 INVALID_REFRESH_TOKEN`. Access TTL 10 min, refresh 7 days. Native apps must keep the cookie (see `frontend/ARCHITECTURE.md`, "The refresh on 401"). |
| Logout (avatar menu) | **Supported** | `POST /auth/logout` → 204, clears the cookie | openapi.json lists it as 200 (no schema); the code sends 204. |
| Sign up (Sign up) | **Partially** | `POST /users/register` `{email, firstName (1–100), lastName (1–100), password (8–128)}` → 201 `{id, email, firstName, lastName, createdAt}` | V1 had **Username** (nickname) and no names. V2 needs **first and last name**, and **min 8** password (V1 allowed 1). `409 EMAIL_TAKEN`, `400 VALIDATION_FAILED` with `details[{path,message}]`. It does not sign in; navigate to Login as V1 did. |
| Current user / username | **Not supported** | – | No `/users/me`; the access token carries only `sub`. |
| Invite a friend (avatar menu) | **Not supported** | – | No equivalent. |
| Keep-alive pings | N/A | – | Lambda warm-up; drop it. |
| List devices (Devices) | **Supported** | `GET /devices` → `[{id, macAddress, name}]` | `deviceName` → `name`. The MAC comes back **lower-case** (enroll stores `toLowerCase()`). |
| Device count badge | **Supported** | derived from the list length | |
| Connected / Disconnected label and dot (device tile, remote tile, InfoBar) | **Not supported** | – | **No online flag** in any response. The only signal is `409 DEVICE_OFFLINE` on learn/press. The NoticeBox copy about "10 minutes" no longer applies. |
| Add device wizard (token, WSS host/URL) | **Replaced** | `POST /devices` `{macAddress, pairingCode, name (trim 1–100)}` → 201 `{id, macAddress, name}` | See section 10. `400 INVALID_PAIRING_CODE`, `409 DEVICE_ALREADY_REGISTERED`, `400 VALIDATION_FAILED`. |
| "Finish setup" "!" badge (FF:FF:… MAC) | N/A | – | A device exists only after enrollment. |
| Delete device / remote / button (edit-mode badge and confirmation) | **Not supported** | – | No DELETE routes. |
| Reorder (drag, `/…/sort`) | **Not supported** | – | No order field. Lists come sorted by name. |
| List remotes (Remotes) | **Supported** | `GET /remotes` → `[{id, deviceId, name, type}]` | `remoteName` → `name`, `category` → `type` enum. The status dot needs the online flag: not supported. |
| Create remote wizard (category → device → name) | **Supported** | `POST /devices/{deviceId}/remotes` `{name (trim 1–100), type}` → 201 `{id, deviceId, name, type}` | `type`: `air_conditioner`, `audio_system`, `dehumidifier`, `heater`, `rgb_lights`, `smart_tv`, `generic_device` (V1's seven categories, one to one). `409 REMOTE_NAME_TAKEN` (unique **per device**), `404 NOT_FOUND` (device). V1's regex `[a-zA-Z0-9- ]+` is stricter than V2. |
| Open a remote (chevron → `/remotes/:remoteName`) | **Supported (by id)** | route by `remote.id` | V1 used the name as the key. |
| Remote details header (InfoBar: name, category, device name, MAC) | **Partially** | no single-remote GET: find the remote in `GET /remotes` and its device in `GET /devices` (by `deviceId`) | Name, type, device name and MAC are all available through the lists. Connected is not. |
| List buttons (Remote details) | **Supported** | `GET /remotes/{remoteId}/buttons` → `[{id, remoteId, name}]` | `404 NOT_FOUND` if the remote is not the user's. |
| "State" / "Stateless" label, "Does your remote have a screen?" step | **Not supported** | – | V2 buttons have no state flag; drop step 1 and step 2's advice, or keep the advice as plain help text. |
| Learn a button (wizard step 5) | **Supported (async)** | `POST /remotes/{remoteId}/buttons` `{name (trim 1–100)}` → **202** `DeviceCommand` + `Location: /device-commands/{id}`; then **poll** `GET /device-commands/{id}` until `status !== 'pending'` | Up front: `404 NOT_FOUND`, `409 BUTTON_NAME_TAKEN` (checked before the read), `409 DEVICE_OFFLINE`, `409 DEVICE_BUSY` (one pending command per device). The device reads for **15 s**; the command lives **20 s**. Results: `succeeded` with `button {id, remoteId, name}`; `failed` or `expired` with `error {code, message}`. |
| Press a button (Power control) | **Supported (async)** | `POST /buttons/{buttonId}/press` (no body) → **202** `DeviceCommand` + Location; poll as above | Up front: `404 NOT_FOUND`, `409 DEVICE_OFFLINE`, `409 DEVICE_BUSY`. Command TTL **5 s** (V1 waited 22 s). Map pending to the spinner, succeeded to the pop and tick, failed or expired to the error state. |
| Error modal with raw text / `alert()` | **Changed** | `errorResponseSchema` codes | V2 shows text from i18n by code (`messages:errors.<CODE>`), never the server's `message`. |

**DeviceCommand** (`deviceCommandResponseSchema`): `{ id: uuid, kind: 'learn_button'|'send_ir', status: 'pending'|'succeeded'|'failed'|'expired', createdAt, expiresAt (ISO), error?: {code, message}, button?: ButtonResponse }`.
`error` is present only when the status is `failed` or `expired`; `button` only when a `learn_button` has `succeeded`.
A pending command past its `expiresAt` reads as `expired`, with code `DEVICE_NOT_RESPONDING`.
Failure codes and their meaning (the device code → API code mapping is in `device-commands.service.ts:56-77`):
| API code | When | Server message |
|---|---|---|
| `IR_READ_TIMEOUT` | device `READ_TIMEOUT` (no IR within 15 s) | The device did not see an IR code in time. |
| `IR_CODE_TOO_LONG` | device `CAPTURE_TOO_LONG` (more than 2048 timings) | The IR code was too long for the device to capture. |
| `IR_SEND_FAILED` | device `SEND_FAILED` | The device could not send the IR signal. |
| `DEVICE_BUSY` | device `BUSY` | The device was busy with another command. |
| `DEVICE_ERROR` | device `INVALID_COMMAND`, `INTERNAL`, or an unknown code | The device could not carry out the command. |
| `DEVICE_NOT_RESPONDING` | socket closed mid-command, or the TTL passed (`expired`) | The device stopped responding. |
| `DEVICE_OFFLINE` | the device left between the online check and the send | The device went offline. |
| `BUTTON_NAME_TAKEN` | the name was taken while the read ran | The remote already has a button with this name. |

The full `errorCodeSchema` list: VALIDATION_FAILED, BAD_REQUEST, INVALID_CREDENTIALS,
INVALID_REFRESH_TOKEN, NOT_FOUND, EMAIL_TAKEN, UNAUTHORIZED, INVALID_PAIRING_CODE,
DEVICE_ALREADY_REGISTERED, REMOTE_NAME_TAKEN, BUTTON_NAME_TAKEN, DEVICE_OFFLINE, DEVICE_BUSY,
IR_READ_TIMEOUT, IR_CODE_TOO_LONG, IR_SEND_FAILED, DEVICE_ERROR, DEVICE_NOT_RESPONDING,
INVALID_DEVICE_CERTIFICATE, INTERNAL_ERROR.

---

## 10. V2 device enrollment flow (what replaces ModalAddDevice)

Sources: `backend/README.md` ("Enrolling a device"), `tools/device-sim/README.md` and `src/format.ts`, `src/device.ts`, `src/terminal.ts`, `src/args.ts`,
`firmware/README.md` and `components/core/src/device.cpp`, `packages/contracts/src/devices/devices.contract.ts`,
`backend/src/features/devices/*`.

1. **The device asks for a code.** It is already on Wi-Fi and holds its factory mTLS certificate,
   whose Subject CN is its MAC address. It calls `POST /pairing-code` on the **device listener**
   (port 8443, mTLS, no body) and gets `201 {pairingCode, expiresAt}`. The code is 8 characters and
   valid for **15 min** (`PAIRING_CODE_TTL_MS`). Asking again replaces the code. An already-enrolled
   device gets `409 DEVICE_ALREADY_REGISTERED`; a certificate whose CN is not a MAC gets
   `403 INVALID_DEVICE_CERTIFICATE`. The board never asks on its own: the owner types `pair` on its
   serial console. The simulator asks on `/enroll`.
2. **The device shows the code.**
   - Simulator: a terminal **QR code** whose payload is built in `tools/device-sim/src/format.ts:7-9`
     (`pairingUri`) and called from `device.ts` (the `pairing` event):
     **`airremote://pair?mac=<MAC>&code=<CODE>`**, for example
     `airremote://pair?mac=AA:BB:CC:DD:EE:01&code=7K4MQ9TX`. The MAC is upper-case (`args.ts` uppercases
     `--mac`), colon-separated and not URL-encoded. The code is the raw 8 characters with no dash. Under
     the QR it prints `code 7K4M-Q9TX · expires in 14:59` (`groupPairingCode`, `formatRemaining` M:SS).
     The source marks the URI as **"A proposal until a UI scans it"**, so the V2 app defines the
     format by implementing the scanner.
   - Real board (`firmware`, `components/core/src/device.cpp`): there is **no QR**, only text on the serial console:
     - `pair` → `asking for a pairing code …`, then `pairing code: 7K4M-Q9TX (expires in 15 min)`
       (minutes rounded); on failure `could not get a pairing code: <reason>`; other replies:
       `already connected`, `no Wi-Fi yet — type: wifi <ssid> <password>`, `already asking for a code`,
       `this device can't connect yet — see status`, and later `pairing code expired — type: pair`.
     - When it is not enrolled it prints `not enrolled — type: pair`.
     - `status` prints the lines (labels padded to 11 columns):
       `firmware   <version>`, `MAC        AA:BB:CC:DD:EE:FF` (upper-case, `%02X:` formatted in `main/main.cpp:56`),
       `identity   provisioned|missing`, `Wi-Fi      <ssid> (connected|connecting)` or `not set`,
       `backend    offline|connecting|connected|not enrolled|not configured`,
       `IR         idle|reading (backend)|reading (console)|self-test|sending`,
       `pairing    7K4M-Q9TX (N min left)` or `pairing    none`.
     So with a real board the user **types the MAC (from `status`) and the code** into the app.
3. **The owner enrolls it in the app.** `POST /devices` (Bearer) `{ macAddress, pairingCode, name }` → `201 {id, macAddress (lower-case), name}`.
   - `macAddress`: `/^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/i`, which means colons are required and either case is accepted ("must be a MAC address like AA:BB:CC:DD:EE:FF").
   - `pairingCode`: input ≤ 32 characters, transformed by `normalisePairingCode` (upper-case; strip
     whitespace and `-`; `O`→`0`; `I`/`L`→`1`) and then matched against
     `/^[0-9A-HJKMNP-TV-Z]{8}$/`. **Alphabet** `PAIRING_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'`
     (Crockford base32: no I, L, O, U), **length** `PAIRING_CODE_LENGTH = 8`. "7k4m-q9tx" and
     "7K4M Q9TX" are both accepted. `normalisePairingCode` is exported from `@airremote/contracts`
     for live formatting in the UI.
   - `name`: trimmed, 1–100 characters.
   - Errors: `400 INVALID_PAIRING_CODE` ("Pairing code is invalid or has expired"; wrong, expired or
     used code, or a code issued to another MAC), `409 DEVICE_ALREADY_REGISTERED`,
     `400 VALIDATION_FAILED` (format; `details[]` has `path` `macAddress`/`pairingCode`/`name`), `401 UNAUTHORIZED`.
   - Codes are stored only as an HMAC (keyed with `PAIRING_CODE_SECRET`).
4. **The device connects.** After `pair` it retries `/ws` every **5 s** until enrolled or the code
   expires (the board retries every 30 s when not enrolled and no code is live). The simulator
   prints `enrolled ✓ connected`, the board `connected`. **The API does not tell the app when this
   happens** (there is no online flag); the app can only assume it, or find out on the first learn/press (`409 DEVICE_OFFLINE`).

A V2 "Add device" wizard in V1's style could be: step 1 instructions (put the device on Wi-Fi, type
`pair`, or scan the QR from the simulator), step 2 scan the QR or type the MAC and code, step 3 the
name, then Finish (`POST /devices`). Use V1's modal chrome: header "Add device", Close (danger light)
and Next/Finish (primary black).

---

## 11. Data shown per page (V1 → V2 field mapping)
- Device tile: `deviceName` → `name`. The status (`connectionId`) has no V2 equivalent. The image is always `microcontroller3.png`.
- Remote tile: `remoteName` → `name`; `category` label → localised label of `type`. The status dot
  has no equivalent. The image comes from `type` (table in 5.2).
- InfoBar: `remoteName` → `remote.name`; `category` → `type` label; `deviceName` → `device.name` (via `remote.deviceId`);
  `macAddress` → `device.macAddress` (lower-case in V2; upper-case it if V1's look is wanted, since V1 showed whatever the backend stored);
  Connected has no equivalent.
- Button tile: `buttonName` → `name`; State/Stateless has no equivalent.
- Counts: list lengths.

---

## 12. Interaction timings (quick reference)
| What | Value |
|---|---|
| Shake | 0.2 s loop, rotate +1° / −1.5° / +1°, ease-in-out, random delay 0–133 ms per tile |
| Pop (press success) | 0.9 s keyframes (1 → 1.2 → 1.1 → 1.2 → 1), visible for 0.8 s |
| Tick draw | invisible for about 125 ms, draws over about 175 ms (ease-out), done at about 300 ms, holds until 800 ms |
| Press control success hold | 800 ms, then idle |
| Press timeout (V1) | 22 s; V2 command TTL 5 s |
| Learn timeout (V1) | 30 s; V2 device read 15 s, command TTL 20 s |
| Touch drag activation | 300 ms long-press, 8 px tolerance |
| "Finish setup" tooltip | auto-hides after 2 s |
| Spinner | 0.8 s per turn (ease ring plus linear dotted ring) |
| Indeterminate bar | 1.5 s, cubic-bezier(.65,.815,.735,.395) |
| Sidebar width | 250 ms ease; labels 300 ms |

---

## 13. States not covered by V1 (decide in V2)
- No loading state for lists (the empty state shows while loading).
- No error state on the page (only the top modal).
- No pull-to-refresh, and no refetch after a press.
- No disabled state on wizard Next buttons: invalid input just ignores the tap.
- No success toast after create, delete or sign-up.

---

## 14. Classes that do nothing in V1 (don't copy them as if they worked)
Checked against the CSS built from V1's own config:
| Class | File:line | Why |
|---|---|---|
| `tems-center` | `components/Sidebar.jsx:11` | typo for `items-center` |
| `w-23` | `components/Toolbar.jsx:11` | no `23` in the spacing scale; the pill is content-width |
| `shadow-xs` | `components/Toolbar.jsx:11` | not in Tailwind 3; the pill has no shadow (`shadow-gray-200` alone only sets a colour) |
| `align-center` | `components/InfoBar.jsx:102` | not a Tailwind class (`items-center` / `content-center`) |
| `lg:text-md` | `components/InfoBar.jsx:126,149` | `text-md` does not exist; category and MAC stay 14 px at lg |
| `align-items` | `components/TileRemoteButton.jsx:68` | not a class |
| `items-left` | `components/TileRemoteButton.jsx:70` | not a class (`items-start`) |
| `flex-col` without `flex` | `pages/Login.jsx:56,57`, `pages/SignUp.jsx:84,85` | needs `display:flex`; these are plain blocks |
| `text-start` | `pages/Login.jsx:48`, `pages/SignUp.jsx:76` | harmless; the children are centred flex items |
| `bg-cover bg-center` on image layers | `InfoBar.jsx:18-84`, `TileDevice.jsx:57` | overridden by the inline `backgroundSize: 'auto 100%'` / `backgroundPosition: 'bottom left'` |
| `shadow-md` on the bottom nav | `components/NavigationBar.jsx:14` | replaced by the inline `boxShadow: 0 -1px 6px -1px rgba(0,0,0,.1)` |
| `w-7` on the avatar Button | `components/TopToolbar.jsx:36` | NextUI's `min-w-10` keeps it 40 px wide |
| `grid-rows-2` | `components/TileGrid.jsx:81` | sizes only the first two rows; no visible effect with fixed-height tiles |
| `color='blue'` (Spinner prop) | `pages/Loading.jsx:7` | invalid NextUI colour, so primary (black) |
| `type="username"` / `"deviceName"` / `"remoteName"` / `"buttonName"` / `"userEmail"` | SignUp:91, ModalAddDevice:154, ModalAddRemote:201, ModalAddButton:199, ModalAddUser:95 | not HTML input types, so they behave as `text` |
| `autoComplete="password"` | `pages/Login.jsx:86` | not a valid token (it should be `current-password`) |
| `<style jsx>` | `components/RemoteButton.jsx:114` | not styled-jsx in Vite: it renders a plain `<style>` element with a stray `jsx` attribute. The CSS still applies globally, so the tick animation **does** work. |
| `stroke-current stroke-[0.2]` / `stroke-2` on svgr icons | `App.jsx:81,88` | they work, but `remote.svg` is filled, so the stroke barely changes its look |
| `bg-black` on the InfoBar divider | `components/InfoBar.jsx:133` | `h-0`, so only the borders and the shadow show |
| `transform` | `components/TileDelete.jsx:51` | redundant in Tailwind 3 (the translate classes apply without it) |

Valid but easy to misread: `border-1` (NextUI, 1 px), `h-100dvh` (custom), `transition-width` (NextUI, 250 ms),
`bg-gray-950` (#030712, valid since Tailwind 3.3), `2xl:grid-cols-15` / `3xl:grid-cols-17` (custom grid columns),
`remove-child-border` (`index.css`), `animate-shake` / `animate-pop` (custom).
