import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { currentPingSlot, getPhase, type Player, type Room } from '../lib/game';
import { sendPing } from '../lib/rooms';

export type PermissionState = 'unknown' | 'granted' | 'denied';

/** Asks for foreground location permission once and reports the result. */
export function useLocationPermission(): PermissionState {
  const [state, setState] = useState<PermissionState>('unknown');
  useEffect(() => {
    Location.requestForegroundPermissionsAsync()
      .then((r) => setState(r.granted ? 'granted' : 'denied'))
      .catch(() => setState('denied'));
  }, []);
  return state;
}

/**
 * Sends this player's location once per ping slot during the hunting phase.
 * Hiders always ping while active; hunters ping only if the room reveals hunters.
 */
export function usePinger(
  room: Room,
  me: Player | undefined,
  now: number,
  permission: PermissionState,
): { lastSentAt: number | null; error: string | null } {
  const lastSlot = useRef<{ round: number | null; slot: number }>({ round: null, slot: -1 });
  const busy = useRef(false);
  const retryAfter = useRef(0);
  const [lastSentAt, setLastSentAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phase = getPhase(room, now);
  const shouldPing =
    !!me &&
    permission === 'granted' &&
    phase === 'hunting' &&
    me.status === 'active' &&
    (me.role === 'hider' || room.settings.revealHunter);

  useEffect(() => {
    if (!shouldPing || !me || busy.current || now < retryAfter.current) return;
    if (lastSlot.current.round !== room.startedAt) {
      lastSlot.current = { round: room.startedAt, slot: -1 };
    }
    const slot = currentPingSlot(room, now);
    if (slot <= lastSlot.current.slot) return;

    busy.current = true;
    (async () => {
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        await sendPing(room.code, me, {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        lastSlot.current.slot = slot;
        setLastSentAt(Date.now());
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        retryAfter.current = Date.now() + 10_000;
      } finally {
        busy.current = false;
      }
    })();
  }, [shouldPing, now, room, me]);

  return { lastSentAt, error };
}
