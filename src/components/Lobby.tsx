import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Share, Text, View } from 'react-native';
import {
  SETTING_LIMITS,
  canStart,
  formatDuration,
  type GameSettings,
  type Player,
  type Room,
} from '../lib/game';
import { leaveRoom, startGame, updateSettings } from '../lib/rooms';
import { useSession } from '../lib/session';
import { Button, Card, Label, Stepper, Toggle, colors, styles } from './ui';

export function Lobby({ room, players, me }: { room: Room; players: Player[]; me: Player }) {
  const { setLastRoom } = useSession();
  const isHost = room.hostId === me.id;
  const [picked, setChosen] = useState<string[]>([]);
  // Ignore picks for players who have since left.
  const chosen = picked.filter((id) => players.some((p) => p.id === id));
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const s = room.settings;

  const set = (patch: Partial<GameSettings>) => {
    updateSettings(room.code, { ...s, ...patch }).catch((e) => setError(String(e)));
  };

  const toggleHunter = (id: string) => {
    if (!isHost) return;
    setChosen(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);
  };

  const effectiveSettings = chosen.length > 0 ? { ...s, hunterCount: chosen.length } : s;
  const blocker = canStart(players, effectiveSettings);

  async function onStart() {
    setStarting(true);
    setError(null);
    try {
      await startGame(room, players, chosen);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  }

  function onLeave() {
    Alert.alert('Leave room?', isHost ? 'You are the host. The room will have no host.' : '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await leaveRoom(room.code, me.id).catch(() => {});
          setLastRoom(null);
          router.back();
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ alignItems: 'center' }}>
        <Label>Room code</Label>
        <Text style={{ color: colors.text, fontSize: 44, fontWeight: '800', letterSpacing: 8 }}>
          {room.code}
        </Text>
        <Button
          title="Share invite"
          variant="secondary"
          onPress={() => Share.share({ message: `Join my Hunt! Room code: ${room.code}` })}
          style={{ alignSelf: 'stretch' }}
        />
      </Card>

      <Card>
        <Label>Players ({players.length})</Label>
        {isHost && (
          <Text style={styles.muted}>
            Tap players to pick hunters yourself, or leave none selected to pick at random.
          </Text>
        )}
        {players.map((p) => {
          const picked = chosen.includes(p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => toggleHunter(p.id)}
              style={[styles.row, { paddingVertical: 4 }]}
            >
              <Text style={styles.rowLabel}>
                {p.name}
                {p.id === room.hostId ? '  · host' : ''}
                {p.id === me.id ? '  (you)' : ''}
              </Text>
              {picked && <Text style={{ color: colors.accent, fontWeight: '700' }}>HUNTER</Text>}
            </Pressable>
          );
        })}
      </Card>

      <Card>
        <Label>Rules {isHost ? '' : '(set by host)'}</Label>
        <Stepper
          label="Hide time"
          value={s.hideSeconds}
          display={formatDuration(s.hideSeconds * 1000)}
          onChange={(v) => set({ hideSeconds: v })}
          {...SETTING_LIMITS.hideSeconds}
          disabled={!isHost}
        />
        <Stepper
          label="Ping every"
          value={s.pingIntervalSeconds}
          display={formatDuration(s.pingIntervalSeconds * 1000)}
          onChange={(v) => set({ pingIntervalSeconds: v })}
          {...SETTING_LIMITS.pingIntervalSeconds}
          disabled={!isHost}
        />
        <Stepper
          label="Hunt length"
          value={s.durationMinutes}
          display={`${s.durationMinutes} min`}
          onChange={(v) => set({ durationMinutes: v })}
          {...SETTING_LIMITS.durationMinutes}
          disabled={!isHost}
        />
        <Stepper
          label="Hunters"
          value={chosen.length > 0 ? chosen.length : s.hunterCount}
          display={String(chosen.length > 0 ? chosen.length : s.hunterCount)}
          onChange={(v) => set({ hunterCount: v })}
          {...SETTING_LIMITS.hunterCount}
          disabled={!isHost || chosen.length > 0}
        />
        <Toggle
          label="Hiders see hunter pings"
          value={s.revealHunter}
          onChange={(v) => set({ revealHunter: v })}
          disabled={!isHost}
        />
      </Card>

      {isHost ? (
        <View style={{ gap: 8 }}>
          <Button title="Start hunt" onPress={onStart} disabled={!!blocker} loading={starting} />
          {blocker && <Text style={styles.muted}>{blocker}</Text>}
        </View>
      ) : (
        <Text style={[styles.muted, { textAlign: 'center' }]}>Waiting for the host to start…</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}

      <Button title="Leave room" variant="secondary" onPress={onLeave} />
    </ScrollView>
  );
}
