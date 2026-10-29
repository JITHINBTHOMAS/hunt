import { useEffect, useRef } from 'react';
import { getOutcome, type Player, type Room } from '../lib/game';
import { endGame } from '../lib/rooms';

/**
 * When the game is decided (all hiders caught, or time up), record the winner on the room.
 * Several phones may try at once; the security rules let only the first one through.
 */
export function useAutoEnd(room: Room | null, players: Player[], uid: string | null, now: number) {
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!room || !uid || room.status !== 'active') return;
    const outcome = getOutcome(room, players, now);
    if (!outcome) return;

    const isHunter = room.hunterIds.includes(uid);
    const isHost = room.hostId === uid;
    // Rules: hunter/host may declare a hunter win; anyone may declare a time-up hiders win.
    if (outcome === 'hunter' && !isHunter && !isHost) return;

    const key = `${room.startedAt}:${outcome}`;
    if (attempted.current === key) return;
    attempted.current = key;
    endGame(room.code, outcome).catch(() => {
      // Someone else probably ended it first. Allow a retry a bit later.
      setTimeout(() => {
        if (attempted.current === key) attempted.current = null;
      }, 5000);
    });
  }, [room, players, uid, now]);
}
