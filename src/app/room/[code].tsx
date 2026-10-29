import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';
import { GameView } from '../../components/GameView';
import { Lobby } from '../../components/Lobby';
import { Results } from '../../components/Results';
import { colors, styles } from '../../components/ui';
import { useAutoEnd } from '../../hooks/useAutoEnd';
import { useNow } from '../../hooks/useNow';
import { useRoom } from '../../hooks/useRoom';
import { getOutcome, getPhase } from '../../lib/game';
import { useSession } from '../../lib/session';

export default function RoomScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { uid } = useSession();
  const { room, players, loading, error } = useRoom(code);
  const now = useNow(1000);
  useAutoEnd(room, players, uid, now);

  if (loading) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!room || !uid) {
    return (
      <View style={[styles.screen, styles.content]}>
        <Text style={styles.error}>{error ?? 'Room not available.'}</Text>
      </View>
    );
  }

  const me = players.find((p) => p.id === uid);
  // Treat a decided game (e.g. last hider just caught) as over even before the room doc says so.
  const phase = getOutcome(room, players, now) ? 'ended' : getPhase(room, now);
  const title =
    phase === 'lobby' ? `Lobby · ${room.code}` : phase === 'ended' ? 'Game over' : `Hunt · ${room.code}`;

  return (
    <>
      <Stack.Screen options={{ title, headerBackVisible: phase === 'lobby' || phase === 'ended' }} />
      {!me ? (
        <View style={[styles.screen, styles.content]}>
          <Text style={styles.text}>You’re not in this room (you may have been removed).</Text>
        </View>
      ) : phase === 'lobby' ? (
        <Lobby room={room} players={players} me={me} />
      ) : phase === 'ended' ? (
        <Results room={room} players={players} me={me} now={now} />
      ) : (
        <GameView room={room} players={players} me={me} now={now} phase={phase} />
      )}
    </>
  );
}
