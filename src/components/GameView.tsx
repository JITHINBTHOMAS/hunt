import { useKeepAwake } from 'expo-keep-awake';
import { Text, View } from 'react-native';
import { useLocationPermission, usePinger } from '../hooks/usePinger';
import {
  activeHiders,
  formatDuration,
  hiders,
  hideEndsAt,
  huntEndsAt,
  nextPingAt,
  type Phase,
  type Player,
  type Room,
} from '../lib/game';
import { HiderView } from './HiderView';
import { HunterView } from './HunterView';
import { colors, styles } from './ui';

export interface GameProps {
  room: Room;
  players: Player[];
  me: Player;
  now: number;
  phase: Exclude<Phase, 'lobby' | 'ended'>;
}

export function GameView(props: GameProps) {
  // MVP requires the app to stay open during a game, so keep the screen on.
  useKeepAwake();
  const { room, players, me, now, phase } = props;
  const permission = useLocationPermission();
  const { error: pingError } = usePinger(room, me, now, permission);

  const isHunter = me.role === 'hunter';
  const phaseEnd = phase === 'hiding' ? hideEndsAt(room)! : huntEndsAt(room)!;
  const next = nextPingAt(room, now);
  const left = activeHiders(players).length;
  const total = hiders(players).length;

  return (
    <View style={styles.screen}>
      <View
        style={{
          padding: 16,
          gap: 4,
          backgroundColor: isHunter ? colors.accent : colors.hider,
        }}
      >
        <Text style={{ color: '#000', fontWeight: '800', fontSize: 13, letterSpacing: 1 }}>
          {isHunter ? 'YOU ARE THE HUNTER' : me.status === 'caught' ? 'CAUGHT' : 'YOU ARE HIDING'}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <View>
            <Text style={{ color: '#000', fontSize: 12 }}>
              {phase === 'hiding' ? 'Hunt starts in' : 'Time left'}
            </Text>
            <Text style={{ color: '#000', fontSize: 34, fontWeight: '800' }}>
              {formatDuration(phaseEnd - now)}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: '#000', fontSize: 12 }}>Next ping</Text>
            <Text style={{ color: '#000', fontSize: 20, fontWeight: '800' }}>
              {next ? formatDuration(next - now) : '—'}
            </Text>
            <Text style={{ color: '#000', fontSize: 12 }}>
              {left}/{total} hiders left
            </Text>
          </View>
        </View>
      </View>

      {permission === 'denied' && (
        <Text style={[styles.error, { padding: 12 }]}>
          Location permission is off. Enable it in Settings. Hunt can’t work without it.
        </Text>
      )}
      {pingError && <Text style={[styles.error, { paddingHorizontal: 12 }]}>Ping failed: {pingError}</Text>}

      {isHunter ? (
        <HunterView {...props} permission={permission} />
      ) : (
        <HiderView {...props} permission={permission} />
      )}
    </View>
  );
}
