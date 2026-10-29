import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  DEFAULT_SETTINGS,
  canStart,
  clampSettings,
  currentPingSlot,
  decodeCatchQr,
  encodeCatchQr,
  generateRoomCode,
  getOutcome,
  getPhase,
  isValidCode,
  latestPings,
  nextPingAt,
  normalizeCode,
  pickHunters,
  type Player,
  type Room,
} from './game.ts';

const T0 = 1_700_000_000_000;

function room(over: Partial<Room> = {}): Room {
  return {
    code: 'ABCDE',
    hostId: 'h',
    status: 'active',
    settings: { ...DEFAULT_SETTINGS, hideSeconds: 60, pingIntervalSeconds: 120, durationMinutes: 10 },
    hunterIds: ['h'],
    startedAt: T0,
    endedAt: null,
    winner: null,
    hidersLeft: 2,
    ...over,
  };
}

const player = (id: string, role: Player['role'], status: Player['status'] = 'active'): Player => ({
  id,
  name: id,
  role,
  status,
  caughtAt: null,
  caughtBy: null,
});

test('room codes are valid and normalised', () => {
  for (let i = 0; i < 200; i++) assert.ok(isValidCode(generateRoomCode()));
  assert.equal(normalizeCode(' ab-cd e '), 'ABCDE');
  assert.equal(isValidCode('ABCD0'), false); // 0 not in alphabet
  assert.equal(isValidCode('ABCD'), false);
});

test('phases follow the clock', () => {
  const r = room();
  assert.equal(getPhase(room({ status: 'lobby', startedAt: null }), T0), 'lobby');
  assert.equal(getPhase(r, T0), 'hiding');
  assert.equal(getPhase(r, T0 + 59_999), 'hiding');
  assert.equal(getPhase(r, T0 + 60_000), 'hunting');
  assert.equal(getPhase(r, T0 + 60_000 + 10 * 60_000 - 1), 'hunting');
  assert.equal(getPhase(r, T0 + 60_000 + 10 * 60_000), 'ended');
  assert.equal(getPhase(room({ status: 'ended' }), T0), 'ended');
});

test('ping slots and next ping', () => {
  const r = room();
  const hunt = T0 + 60_000;
  assert.equal(currentPingSlot(r, T0), -1);
  assert.equal(nextPingAt(r, T0), hunt);
  assert.equal(currentPingSlot(r, hunt), 0);
  assert.equal(nextPingAt(r, hunt), hunt + 120_000);
  assert.equal(currentPingSlot(r, hunt + 119_999), 0);
  assert.equal(currentPingSlot(r, hunt + 120_000), 1);
  // 10 min / 2 min = slots 0..4; no ping at the exact end.
  assert.equal(nextPingAt(r, hunt + 4 * 120_000), null);
  assert.equal(currentPingSlot(r, hunt + 60 * 60_000), 4);
});

test('outcome: hunter wins when all caught, hiders win on time', () => {
  const r = room();
  const hunting = T0 + 90_000;
  const end = T0 + 60_000 + 10 * 60_000;
  const ps = [player('h', 'hunter'), player('a', 'hider'), player('b', 'hider')];
  assert.equal(getOutcome(r, ps, hunting), null);
  assert.equal(getOutcome(r, [ps[0], player('a', 'hider', 'caught'), ps[2]], hunting), null);
  assert.equal(
    getOutcome(r, [ps[0], player('a', 'hider', 'caught'), player('b', 'hider', 'caught')], hunting),
    'hunter',
  );
  assert.equal(getOutcome(r, ps, end), 'hiders');
  assert.equal(getOutcome(room({ winner: 'hunter' }), ps, hunting), 'hunter');
  assert.equal(getOutcome(room({ status: 'lobby', startedAt: null }), ps, hunting), null);
});

test('pickHunters always leaves a hider', () => {
  const ids = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) {
    const h = pickHunters(ids, 5);
    assert.equal(h.length, 2);
    assert.equal(new Set(h).size, 2);
  }
  assert.equal(pickHunters(['a', 'b'], 1).length, 1);
});

test('canStart', () => {
  assert.ok(canStart([player('a', 'hider')], DEFAULT_SETTINGS));
  assert.equal(canStart([player('a', 'hider'), player('b', 'hider')], DEFAULT_SETTINGS), null);
  assert.ok(canStart([player('a', 'hider'), player('b', 'hider')], { ...DEFAULT_SETTINGS, hunterCount: 2 }));
});

test('clampSettings', () => {
  const s = clampSettings({ hideSeconds: 1, pingIntervalSeconds: 99999, durationMinutes: NaN, hunterCount: 3 });
  assert.equal(s.hideSeconds, 30);
  assert.equal(s.pingIntervalSeconds, 1800);
  assert.equal(s.durationMinutes, DEFAULT_SETTINGS.durationMinutes);
  assert.equal(s.hunterCount, 3);
  assert.equal(s.revealHunter, false);
});

test('QR round trip and rejection', () => {
  const qr = encodeCatchQr('ABCDE', 'uid123', 'tok');
  assert.deepEqual(decodeCatchQr(qr), { code: 'ABCDE', playerId: 'uid123', token: 'tok' });
  assert.equal(decodeCatchQr('https://example.com'), null);
  assert.equal(decodeCatchQr('hunt1:ABCDE::tok'), null);
});

test('latestPings keeps newest per player', () => {
  const mk = (id: string, playerId: string, at: number) => ({
    id, playerId, name: playerId, role: 'hider' as const, lat: 0, lng: 0, accuracy: null, at,
  });
  const res = latestPings([mk('1', 'a', 1), mk('2', 'a', 5), mk('3', 'b', 3)]);
  assert.deepEqual(res.map((p) => p.id), ['2', '3']);
});
