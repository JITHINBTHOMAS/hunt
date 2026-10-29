import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { formatDuration, getOutcome, hideEndsAt, hiders, type Player, type Room } from '../lib/game';
import { playAgain } from '../lib/rooms';
import { Button, Card, Label, colors, styles } from './ui';

export function Results({ room, players, me, now }: { room: Room; players: Player[]; me: Player; now: number }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const winner = getOutcome(room, players, now) ?? 'hiders';
  const iWon = (winner === 'hunter') === (me.role === 'hunter');
  const huntStart = hideEndsAt(room) ?? 0;
  const hunters = players.filter((p) => p.role === 'hunter');
  const hs = hiders(players).sort((a, b) => (a.caughtAt ?? Infinity) - (b.caughtAt ?? Infinity));

  async function onPlayAgain() {
    setBusy(true);
    try {
      await playAgain(room, players);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={{ alignItems: 'center', borderColor: iWon ? colors.success : colors.danger }}>
        <Text style={{ fontSize: 14, color: colors.muted, fontWeight: '700' }}>
          {winner === 'hunter' ? 'THE HUNTER WINS' : 'THE HIDERS WIN'}
        </Text>
        <Text style={[styles.title, { color: iWon ? colors.success : colors.danger }]}>
          {iWon ? 'You won!' : 'You lost'}
        </Text>
        <Text style={styles.muted}>Hunter{hunters.length > 1 ? 's' : ''}: {hunters.map((h) => h.name).join(', ')}</Text>
      </Card>

      <Card>
        <Label>Hiders</Label>
        {hs.map((p) => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.rowLabel}>{p.name}</Text>
            <Text style={{ color: p.status === 'caught' ? colors.danger : colors.success }}>
              {p.status === 'caught' && p.caughtAt
                ? `caught at ${formatDuration(p.caughtAt - huntStart)}`
                : 'survived'}
            </Text>
          </View>
        ))}
      </Card>

      {room.hostId === me.id ? (
        <Button title="Play again (back to lobby)" onPress={onPlayAgain} loading={busy} />
      ) : (
        <Text style={[styles.muted, { textAlign: 'center' }]}>The host can start another round.</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title="Home" variant="secondary" onPress={() => router.dismissTo('/')} />
    </ScrollView>
  );
}
