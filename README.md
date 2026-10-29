# Hunt

A real-world hide-and-seek game for phones. One player hosts a room, friends join with a code, and after a hide timer the hunter starts getting periodic location pings from every hider. The hunter wins by catching everyone (scanning their QR code) before time runs out.

Built with **Expo (React Native) + Firebase** (Anonymous Auth + Firestore).

## How a game works

1. **Host** creates a room and gets a 5-character code to share.
2. **Players** join with the code. The host sets the rules:
   - hide time
   - how often pings happen
   - hunt length
   - number of hunters (random, or tap players to pick)
   - whether hiders can see the hunter's pings too
3. **Start**: everyone sees a countdown while hiders scatter.
4. **Hunt**: every ping interval, each hider's phone sends its GPS position. Only hunters can see these, on a map. Markers fade from red to grey as they get old.
5. **Catch**: when the hunter finds someone, they scan the QR code on the hider's screen.
6. **End**: the hunter wins if everyone is caught. The hiders win if the timer runs out. The host can start another round.

The app must stay open during a game; it keeps the screen awake. Background tracking is on the roadmap.

## Setup (one time)

### 1. Install tools
- [Node.js LTS](https://nodejs.org) (v20 or newer)
- The **Expo Go** app on your phone (Play Store / App Store)

### 2. Create a Firebase project
1. Go to <https://console.firebase.google.com> → **Add project** (Analytics not needed).
2. **Build → Authentication → Get started → Sign-in method → Anonymous → Enable.**
3. **Build → Firestore Database → Create database** (production mode, pick a region near you).
4. **Project settings (gear) → Your apps → Web (`</>`)**, register an app, and copy the config values.

### 3. Configure the app
```bash
npm install
cp .env.example .env      # on Windows: copy .env.example .env
```
Fill in the `EXPO_PUBLIC_FIREBASE_*` values in `.env`.

### 4. Deploy the security rules + index
```bash
npm install -g firebase-tools
firebase login
firebase use --add          # pick your project
firebase deploy --only firestore
```
The rules in `firestore.rules` are what stop hiders from seeing each other's locations and stop fake catches. Don't skip this step.

### 5. Run it
```bash
npx expo start
```
Scan the QR code with Expo Go (Android) or the Camera app (iOS). To test a game you need at least 2 phones, or one phone plus an Android emulator with a mock location.

## Project layout

```
src/
  app/                  Expo Router screens
    _layout.tsx         stack + session provider
    index.tsx           home: name, create room, join room
    room/[code].tsx     picks Lobby / Game / Results based on the phase
  components/
    Lobby.tsx           players, rules editor, start
    GameView.tsx        timers bar + hunter/hider view
    HunterView.tsx      map of pings, hider list, scan button
    HiderView.tsx       your QR catch code, (optional) hunter map
    CatchScanner.tsx    camera QR scanner
    Results.tsx         winner, catch times, play again
    ui.tsx              buttons, cards, steppers, theme
  hooks/                useRoom, usePings, usePinger, useAutoEnd, useNow, useMyPosition
  lib/
    game.ts             pure game rules (phases, ping schedule, outcome); unit tested
    rooms.ts            all Firestore reads/writes
    firebase.ts         Firebase init
    session.tsx         anonymous sign-in, saved name / last room
firestore.rules         security rules (who can read pings, verified catches)
firestore.indexes.json  composite index for hunter-ping query
```

## Scripts

| Command | What it does |
|---|---|
| `npm start` | start the Expo dev server |
| `npm test` | unit tests for game logic (`src/lib/game.test.ts`) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |

## Design notes

- **Phases are derived from timestamps** (`startedAt` + settings), so every phone agrees without a server ticking. Phone clocks are normally within a second or two; the rules allow 5 s of drift.
- **Pings are scheduled** at `hideEnd + k × interval`. Each phone sends once per slot.
- **Catches are verified by Firestore rules.** Each hider has a secret token, readable only by them and rotated every round. The QR code contains it, and the rules check it before a player can be marked caught. Each catch also decrements `hidersLeft` on the room, and a hunter can only declare a win when it reaches 0.

## Roadmap

- [ ] Background location (Android foreground service / iOS "Always"). Needs a dev build (`eas build`).
- [ ] Play-area boundary + warning when a hider leaves it
- [ ] More modes: caught hiders become hunters, shrinking zone, decoy pings
- [ ] Push notifications for "ping incoming"
- [ ] Cloud Function to clean up old rooms/pings
- [ ] Anti-spoofing checks (impossible speed between pings)
- [ ] Store release: app icons, privacy policy, store listings
