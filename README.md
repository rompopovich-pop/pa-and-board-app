# PA & Board App

One app, two products, sharing an app shell, auth, and backend: a WhatsApp+voice
personal assistant, and a "Business Board" CRM for small business owners. See
`pa-whatsapp-spec.md`, `business-board-spec.md`, `design-ux-localization-spec.md`,
and `build-sequence.md` for the full product/technical specs.

This is the **Session 0 shared foundation**: app shell, i18n (English + Hebrew
with RTL), the base design system, backend scaffold, Postgres, and basic auth.
No PA or Board features are built yet.

## Layout

- `app/` — React Native (Expo) app, iOS + Android, TypeScript.
- `backend/` — Node.js/Express API, TypeScript, Prisma + Postgres.

## Backend setup

```bash
cd backend
cp .env.example .env
docker compose up -d          # starts local Postgres on :5432
npm install
npm run prisma:migrate        # creates the users table
npm run dev                   # http://localhost:4000
```

Sanity check: `curl http://localhost:4000/health` should return `{"status":"ok"}`.

Auth endpoints: `POST /auth/signup`, `POST /auth/login`, `GET /auth/me` (Bearer token).

## App setup

```bash
cd app
cp .env.example .env          # set EXPO_PUBLIC_API_URL if not using localhost
npm install
npx expo install --fix        # reconcile native dep versions for your SDK/toolchain
npm start                     # opens Expo dev tools; press i / a for iOS/Android
```

The app needs the backend running (see above) to sign up / log in.

## Design system

All colors, spacing, radii, and typography live in `app/src/theme/tokens.ts` —
every screen consumes these tokens rather than hardcoding values, so the warm
palette (cream background, terracotta primary accent, sage secondary) or the
corner radius can be changed in one place. The reusable "this needs your OK"
pattern lives in `app/src/components/ConfirmationCard.tsx` and is demoed on
both placeholder screens (PA and Business Board modes).

## i18n & RTL

- Languages: English (`en`) and Hebrew (`he`), configured in `app/src/i18n`.
- Device locale is auto-detected on first launch (`expo-localization`); the
  user can override it from Settings → Language.
- Hebrew flips the whole app to RTL via `I18nManager.forceRTL`
  (`app/src/context/LanguageContext.tsx`), which triggers a reload so every
  screen picks up the new writing direction.
- Layouts use logical/direction-aware properties (`flexDirection: "row"`,
  `borderTopStartRadius`, etc.) rather than hardcoded left/right so the RTL
  flip works without per-screen fixes.
- Adding a string: add the key to both `app/src/i18n/locales/en.json` and
  `he.json`.

**Test both languages as you build new screens** — catching an RTL layout
issue early is much cheaper than retrofitting it later (see `build-sequence.md`).

## What's next

Per `build-sequence.md`, Session 1 builds the PA's WhatsApp integration,
conversation engine, and reminders on top of this shell.
