// Pure game rules. No Firebase / React imports, so this file is unit-testable.

export type RoomStatus = 'lobby' | 'active' | 'ended';
export type Phase = 'lobby' | 'hiding' | 'hunting' | 'ended';
export type Role = 'hunter' | 'hider';
export type PlayerStatus = 'active' | 'caught';
export type Winner = 'hunter' | 'hiders';

export interface GameSettings {
  /** Seconds hiders get to scatter before pings start. */
  hideSeconds: number;
  /** Every N seconds each active hider's location is revealed to the hunter(s). */
  pingIntervalSeconds: number;
  /** Length of the hunting phase in minutes. */
  durationMinutes: number;
  /** How many hunters are picked at start. */
  hunterCount: number;
  /** If true, hiders also see the hunters' pings (on the same schedule). */
  revealHunter: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  hideSeconds: 300,
  pingIntervalSeconds: 120,
  durationMinutes: 30,
  hunterCount: 1,
  revealHunter: false,
};

/** Allowed ranges, shared by the settings UI and validation. */
export const SETTING_LIMITS = {
  hideSeconds: { min: 30, max: 3600, step: 30 },
  pingIntervalSeconds: { min: 30, max: 1800, step: 30 },
  durationMinutes: { min: 5, max: 240, step: 5 },
  hunterCount: { min: 1, max: 5, step: 1 },
} as const;

export interface Room {
  code: string;
  hostId: string;
  status: RoomStatus;
  settings: GameSettings;
  hunterIds: string[];
  /** Epoch ms when the host pressed Start (hide phase begins). */
  startedAt: number | null;
  /** Epoch ms when the game was ended (all caught, time up, or host ended it). */
  endedAt: number | null;
  winner: Winner | null;
  /** Active hiders remaining; kept in sync by catches (the rules use it to verify a hunter win). */
  hidersLeft: number;
}

export interface Player {
  id: string;
  name: string;
  role: Role;
  status: PlayerStatus;
  caughtAt: number | null;
  caughtBy: string | null;
}

export interface Ping {
  id: string;
  playerId: string;
  name: string;
  role: Role;
  lat: number;
  lng: number;
  accuracy: number | null;
  /** Epoch ms. */
  at: number;
}

export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
export const CODE_LENGTH = 5;

export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return code;
}

export function normalizeCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((c) => CODE_ALPHABET.includes(c));
}

export function clampSettings(s: Partial<GameSettings>): GameSettings {
  const merged = { ...DEFAULT_SETTINGS, ...s };
  const clamp = (v: number, k: keyof typeof SETTING_LIMITS) => {
    const { min, max } = SETTING_LIMITS[k];
    const n = Number.isFinite(v) ? Math.round(v) : DEFAULT_SETTINGS[k];
    return Math.min(max, Math.max(min, n));
  };
  return {
    hideSeconds: clamp(merged.hideSeconds, 'hideSeconds'),
    pingIntervalSeconds: clamp(merged.pingIntervalSeconds, 'pingIntervalSeconds'),
    durationMinutes: clamp(merged.durationMinutes, 'durationMinutes'),
    hunterCount: clamp(merged.hunterCount, 'hunterCount'),
    revealHunter: !!merged.revealHunter,
  };
}

export function hideEndsAt(room: Pick<Room, 'startedAt' | 'settings'>): number | null {
  if (room.startedAt == null) return null;
  return room.startedAt + room.settings.hideSeconds * 1000;
}

export function huntEndsAt(room: Pick<Room, 'startedAt' | 'settings'>): number | null {
  const h = hideEndsAt(room);
  if (h == null) return null;
  return h + room.settings.durationMinutes * 60_000;
}

/** Phase is derived from timestamps so every phone agrees without a server tick. */
export function getPhase(room: Room, now: number): Phase {
  if (room.status === 'lobby' || room.startedAt == null) return 'lobby';
  if (room.status === 'ended') return 'ended';
  const hide = hideEndsAt(room)!;
  const end = huntEndsAt(room)!;
  if (now < hide) return 'hiding';
  if (now < end) return 'hunting';
  return 'ended';
}

/**
 * Pings happen at hideEndsAt + k * interval (k = 0, 1, 2, ...).
 * Returns the index of the most recent ping slot at `now`, or -1 if none yet.
 */
export function currentPingSlot(room: Room, now: number): number {
  const hide = hideEndsAt(room);
  const end = huntEndsAt(room);
  if (hide == null || end == null || now < hide) return -1;
  const t = Math.min(now, end - 1);
  return Math.floor((t - hide) / (room.settings.pingIntervalSeconds * 1000));
}

/** Epoch ms of the next ping, or null if no more pings this game. */
export function nextPingAt(room: Room, now: number): number | null {
  const hide = hideEndsAt(room);
  const end = huntEndsAt(room);
  if (hide == null || end == null) return null;
  if (now < hide) return hide;
  const interval = room.settings.pingIntervalSeconds * 1000;
  const next = hide + (currentPingSlot(room, now) + 1) * interval;
  return next < end ? next : null;
}

export function hiders(players: Player[]): Player[] {
  return players.filter((p) => p.role === 'hider');
}

export function activeHiders(players: Player[]): Player[] {
  return hiders(players).filter((p) => p.status === 'active');
}

/**
 * Who won? Returns null while the game is still undecided.
 * Hunter wins once every hider is caught; hiders win if time runs out first.
 */
export function getOutcome(room: Room, players: Player[], now: number): Winner | null {
  if (room.winner) return room.winner;
  if (room.status === 'lobby' || room.startedAt == null) return null;
  const hs = hiders(players);
  if (hs.length > 0 && activeHiders(players).length === 0) return 'hunter';
  if (getPhase(room, now) === 'ended') return 'hiders';
  return null;
}

/** Pick `count` hunters at random (Fisher–Yates), always leaving at least one hider. */
export function pickHunters(
  playerIds: string[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const n = Math.max(1, Math.min(count, playerIds.length - 1));
  const ids = [...playerIds];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

export function canStart(players: Player[], settings: GameSettings): string | null {
  if (players.length < 2) return 'Need at least 2 players.';
  if (settings.hunterCount >= players.length) return 'Need at least one hider. Lower the hunter count.';
  return null;
}

/** Latest ping per player, newest first. */
export function latestPings(pings: Ping[]): Ping[] {
  const byPlayer = new Map<string, Ping>();
  for (const p of pings) {
    const cur = byPlayer.get(p.playerId);
    if (!cur || p.at > cur.at) byPlayer.set(p.playerId, p);
  }
  return [...byPlayer.values()].sort((a, b) => b.at - a.at);
}

// ---- QR catch tokens ----------------------------------------------------

const QR_PREFIX = 'hunt1';

export function encodeCatchQr(code: string, playerId: string, token: string): string {
  return [QR_PREFIX, code, playerId, token].join(':');
}

export function decodeCatchQr(
  data: string,
): { code: string; playerId: string; token: string } | null {
  const parts = data.split(':');
  if (parts.length !== 4 || parts[0] !== QR_PREFIX) return null;
  const [, code, playerId, token] = parts;
  if (!code || !playerId || !token) return null;
  return { code, playerId, token };
}

export function randomToken(random: () => number = Math.random, length = 24): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < length; i++) s += chars[Math.floor(random() * chars.length)];
  return s;
}

// ---- formatting ---------------------------------------------------------

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return (h > 0 ? `${h}:` : '') + `${mm}:${String(s).padStart(2, '0')}`;
}

export function formatAgo(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  return `${m}m ago`;
}

/** Haversine distance in metres. */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
