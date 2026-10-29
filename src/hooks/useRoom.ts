import { useEffect, useMemo, useState } from 'react';
import type { Ping, Player, Room } from '../lib/game';
import { subscribePings, subscribePlayers, subscribeRoom } from '../lib/rooms';

export function useRoom(code: string | undefined) {
  // undefined = still loading, null = room doesn't exist
  const [room, setRoom] = useState<Room | null | undefined>(undefined);
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    const onErr = (e: Error) => setError(e.message);
    const u1 = subscribeRoom(
      code,
      (r) => {
        setRoom(r);
        if (!r) setError('Room not found.');
      },
      onErr,
    );
    const u2 = subscribePlayers(code, setPlayers, onErr);
    return () => {
      u1();
      u2();
    };
  }, [code]);

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => a.name.localeCompare(b.name)),
    [players],
  );

  return { room: room ?? null, players: sortedPlayers, loading: room === undefined && !error, error };
}

/** Live pings for the current round. `enabled` should be false when the user isn't allowed to read any. */
export function usePings(
  code: string,
  asHunter: boolean,
  since: number | null,
  enabled: boolean,
): { pings: Ping[]; error: string | null } {
  const [pings, setPings] = useState<Ping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!enabled || since == null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = subscribePings(
      code,
      asHunter,
      since,
      (p) => {
        setPings(p);
        setError(null);
      },
      (e) => {
        // Firestore closes a listener after an error; try again shortly.
        setError(e.message);
        timer = setTimeout(() => setRetry((r) => r + 1), 5000);
      },
    );
    return () => {
      unsub();
      if (timer) clearTimeout(timer);
    };
  }, [code, asHunter, since, enabled, retry]);

  // Drop pings from an earlier round or when listening is switched off.
  const current = useMemo(
    () => (enabled && since != null ? pings.filter((p) => p.at >= since) : []),
    [pings, enabled, since],
  );
  return { pings: current, error };
}
