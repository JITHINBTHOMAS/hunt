import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  addDoc,
  deleteDoc,
  deleteField,
  increment,
  type DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import {
  DEFAULT_SETTINGS,
  clampSettings,
  decodeCatchQr,
  generateRoomCode,
  pickHunters,
  randomToken,
  type GameSettings,
  type Ping,
  type Player,
  type Role,
  type Room,
  type Winner,
} from './game';

// Firestore layout:
//   rooms/{code}                    -> Room
//   rooms/{code}/players/{uid}      -> Player
//   rooms/{code}/secrets/{uid}      -> { token }   (only the owner can read; used for QR catches)
//   rooms/{code}/pings/{autoId}     -> Ping        (hunters read all; hiders read hunter pings if revealHunter)

const roomRef = (code: string) => doc(db, 'rooms', code);
const playersCol = (code: string) => collection(db, 'rooms', code, 'players');
const playerRef = (code: string, uid: string) => doc(db, 'rooms', code, 'players', uid);
const secretRef = (code: string, uid: string) => doc(db, 'rooms', code, 'secrets', uid);
const pingsCol = (code: string) => collection(db, 'rooms', code, 'pings');

function toRoom(code: string, d: DocumentData): Room {
  return {
    code,
    hostId: d.hostId,
    status: d.status ?? 'lobby',
    settings: clampSettings(d.settings ?? {}),
    hunterIds: d.hunterIds ?? [],
    startedAt: d.startedAt ?? null,
    endedAt: d.endedAt ?? null,
    winner: d.winner ?? null,
    hidersLeft: d.hidersLeft ?? 0,
  };
}

function toPlayer(id: string, d: DocumentData): Player {
  return {
    id,
    name: d.name ?? 'Player',
    role: d.role ?? 'hider',
    status: d.status ?? 'active',
    caughtAt: d.caughtAt ?? null,
    caughtBy: d.caughtBy ?? null,
  };
}

function toPing(id: string, d: DocumentData): Ping {
  return {
    id,
    playerId: d.playerId,
    name: d.name ?? '',
    role: d.role ?? 'hider',
    lat: d.lat,
    lng: d.lng,
    accuracy: d.accuracy ?? null,
    at: d.at,
  };
}

// ---- lobby --------------------------------------------------------------

export async function createRoom(uid: string, name: string): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode();
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef(code));
      if (snap.exists()) return false;
      tx.set(roomRef(code), {
        hostId: uid,
        status: 'lobby',
        settings: DEFAULT_SETTINGS,
        hunterIds: [],
        startedAt: null,
        endedAt: null,
        winner: null,
        hidersLeft: 0,
        lastCaught: null,
        createdAt: serverTimestamp(),
      });
      return true;
    });
    if (created) {
      await joinRoom(code, uid, name);
      return code;
    }
  }
  throw new Error('Could not create a room, please try again.');
}

export async function joinRoom(code: string, uid: string, name: string): Promise<void> {
  const snap = await getDoc(roomRef(code));
  if (!snap.exists()) throw new Error('No room with that code.');
  const room = toRoom(code, snap.data());

  const existing = await getDoc(playerRef(code, uid));
  if (existing.exists()) {
    // Rejoining (e.g. app restarted). Only the name may change.
    if (existing.data().name !== name) await updateDoc(playerRef(code, uid), { name });
    return;
  }
  if (room.status !== 'lobby') throw new Error('That game has already started.');

  await setDoc(playerRef(code, uid), {
    name,
    role: 'hider',
    status: 'active',
    caughtAt: null,
    caughtBy: null,
    joinedAt: serverTimestamp(),
  });
  await setDoc(secretRef(code, uid), { token: randomToken(), round: 0 });
}

export async function leaveRoom(code: string, uid: string): Promise<void> {
  await deleteDoc(playerRef(code, uid));
}

export async function updateSettings(code: string, settings: Partial<GameSettings>): Promise<void> {
  await updateDoc(roomRef(code), { settings: clampSettings(settings) });
}

/** Host only. Picks hunters (random unless `chosenHunters` given) and starts the hide phase. */
export async function startGame(
  room: Room,
  players: Player[],
  chosenHunters?: string[],
): Promise<void> {
  const ids = players.map((p) => p.id);
  const hunterIds =
    chosenHunters && chosenHunters.length > 0
      ? chosenHunters
      : pickHunters(ids, room.settings.hunterCount);

  const batch = writeBatch(db);
  for (const p of players) {
    const role: Role = hunterIds.includes(p.id) ? 'hunter' : 'hider';
    batch.update(playerRef(room.code, p.id), { role, status: 'active', caughtAt: null, caughtBy: null });
  }
  batch.update(roomRef(room.code), {
    status: 'active',
    hunterIds,
    // Phones derive phases from this. Small clock differences between phones are OK for an MVP.
    startedAt: Date.now(),
    endedAt: null,
    winner: null,
    hidersLeft: players.length - hunterIds.length,
    lastCaught: null,
  });
  try {
    await batch.commit();
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'not-found') throw new Error('Someone just left the room. Try starting again.');
    throw e;
  }
}

export async function endGame(code: string, winner: Winner): Promise<void> {
  await updateDoc(roomRef(code), { status: 'ended', winner, endedAt: Date.now() });
}

/** Host only: send everyone back to the lobby for another round. */
export async function playAgain(room: Room, players: Player[]): Promise<void> {
  const batch = writeBatch(db);
  for (const p of players) {
    batch.update(playerRef(room.code, p.id), {
      role: 'hider',
      status: 'active',
      caughtAt: null,
      caughtBy: null,
      catchToken: deleteField(),
    });
  }
  batch.update(roomRef(room.code), {
    status: 'lobby',
    hunterIds: [],
    startedAt: null,
    endedAt: null,
    winner: null,
    hidersLeft: 0,
    lastCaught: null,
  });
  await batch.commit();
}

// ---- in game ------------------------------------------------------------

/**
 * Returns this player's QR catch token for the current round, generating a fresh one
 * each round so a token seen in an earlier game can't be reused.
 */
export async function getRoundCatchToken(code: string, uid: string, round: number): Promise<string> {
  const snap = await getDoc(secretRef(code, uid));
  if (snap.exists() && snap.data().round === round) return snap.data().token as string;
  const token = randomToken();
  await setDoc(secretRef(code, uid), { token, round });
  return token;
}

export async function sendPing(
  code: string,
  me: Pick<Player, 'id' | 'name' | 'role'>,
  coords: { latitude: number; longitude: number; accuracy: number | null },
): Promise<void> {
  await addDoc(pingsCol(code), {
    playerId: me.id,
    name: me.name,
    role: me.role,
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: coords.accuracy,
    at: Date.now(),
    serverAt: serverTimestamp(),
  });
}

export type CatchResult =
  | { ok: true; name: string }
  | { ok: false; reason: string };

/** Hunter scanned a hider's QR. Firestore rules verify the secret token. */
export async function catchFromQr(
  code: string,
  hunterUid: string,
  qrData: string,
  players: Player[],
): Promise<CatchResult> {
  const parsed = decodeCatchQr(qrData);
  if (!parsed) return { ok: false, reason: 'That is not a Hunt QR code.' };
  if (parsed.code !== code) return { ok: false, reason: 'That player is in a different room.' };
  const target = players.find((p) => p.id === parsed.playerId);
  if (!target) return { ok: false, reason: 'Unknown player.' };
  if (target.role !== 'hider') return { ok: false, reason: 'That is a hunter!' };
  if (target.status === 'caught') return { ok: false, reason: `${target.name} is already caught.` };
  try {
    // Player + room counter change together; the rules check both sides of the batch.
    const batch = writeBatch(db);
    batch.update(playerRef(code, target.id), {
      status: 'caught',
      caughtAt: Date.now(),
      caughtBy: hunterUid,
      catchToken: parsed.token,
    });
    batch.update(roomRef(code), { hidersLeft: increment(-1), lastCaught: target.id });
    await batch.commit();
    return { ok: true, name: target.name };
  } catch {
    return { ok: false, reason: 'Catch rejected. The QR code may be invalid or the game is not in the hunting phase.' };
  }
}

// ---- subscriptions ------------------------------------------------------

export function subscribeRoom(
  code: string,
  onRoom: (room: Room | null) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    roomRef(code),
    (snap) => onRoom(snap.exists() ? toRoom(code, snap.data()) : null),
    onError,
  );
}

export function subscribePlayers(
  code: string,
  onPlayers: (players: Player[]) => void,
  onError: (e: Error) => void,
) {
  return onSnapshot(
    playersCol(code),
    (snap) => onPlayers(snap.docs.map((d) => toPlayer(d.id, d.data()))),
    onError,
  );
}

/**
 * Only pings from the current round (at >= since).
 * Hunters get every ping; hiders only get hunter pings (and only if revealHunter is on).
 * The query shapes must match firestore.rules or the listener is rejected.
 */
export function subscribePings(
  code: string,
  asHunter: boolean,
  since: number,
  onPings: (pings: Ping[]) => void,
  onError: (e: Error) => void,
) {
  const q = asHunter
    ? query(pingsCol(code), where('at', '>=', since), orderBy('at', 'desc'), limit(300))
    : query(
        pingsCol(code),
        where('role', '==', 'hunter'),
        where('at', '>=', since),
        orderBy('at', 'desc'),
        limit(100),
      ); // needs the composite index in firestore.indexes.json
  return onSnapshot(q, (snap) => onPings(snap.docs.map((d) => toPing(d.id, d.data()))), onError);
}
