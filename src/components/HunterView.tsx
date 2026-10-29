import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import MapView, { Circle, Marker } from 'react-native-maps';
import { useMyPosition } from '../hooks/useMyPosition';
import type { PermissionState } from '../hooks/usePinger';
import { usePings } from '../hooks/useRoom';
import { distanceMeters, formatAgo, hiders, latestPings } from '../lib/game';
import { CatchScanner } from './CatchScanner';
import type { GameProps } from './GameView';
import { Button, colors, styles } from './ui';

/** Marker colour fades from red (fresh) to grey (stale) over two ping intervals. */
function freshnessColor(ageMs: number, intervalMs: number): string {
  const t = Math.min(1, ageMs / (intervalMs * 2));
  if (t < 0.5) return '#FF3B30';
  if (t < 1) return '#FF9500';
  return '#8E8E93';
}

export function HunterView({ room, players, me, now, phase, permission }: GameProps & { permission: PermissionState }) {
  const [scanning, setScanning] = useState(false);
  const mapRef = useRef<MapView>(null);
  const myPos = useMyPosition(permission);
  const { pings, error } = usePings(room.code, true, room.startedAt, phase === 'hunting');

  const hiderList = hiders(players);
  const activeIds = new Set(hiderList.filter((p) => p.status === 'active').map((p) => p.id));
  const latest = useMemo(
    () => latestPings(pings.filter((p) => p.role === 'hider' && activeIds.has(p.playerId))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pings, players],
  );

  // Buzz when a new round of pings arrives.
  const lastPingAt = latest[0]?.at ?? 0;
  const seen = useRef(0);
  useEffect(() => {
    if (lastPingAt > seen.current) {
      if (seen.current !== 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      seen.current = lastPingAt;
    }
  }, [lastPingAt]);

  // Centre on me the first time we know where I am.
  const centred = useRef(false);
  useEffect(() => {
    if (myPos && !centred.current && mapRef.current) {
      centred.current = true;
      mapRef.current.animateToRegion(
        { latitude: myPos.lat, longitude: myPos.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
        500,
      );
    }
  }, [myPos]);

  const intervalMs = room.settings.pingIntervalSeconds * 1000;
  const pingFor = (id: string) => latest.find((p) => p.playerId === id);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          showsUserLocation
          showsMyLocationButton
          initialRegion={
            myPos
              ? { latitude: myPos.lat, longitude: myPos.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }
              : undefined
          }
        >
          {latest.map((p) => (
            <Marker
              key={p.playerId}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.name}
              description={`Pinged ${formatAgo(now - p.at)}`}
              pinColor={freshnessColor(now - p.at, intervalMs)}
            />
          ))}
          {latest.map((p) =>
            p.accuracy ? (
              <Circle
                key={`acc-${p.playerId}`}
                center={{ latitude: p.lat, longitude: p.lng }}
                radius={p.accuracy}
                strokeColor="rgba(255,59,48,0.6)"
                fillColor="rgba(255,59,48,0.12)"
              />
            ) : null,
          )}
        </MapView>
        {phase === 'hiding' && (
          <View
            style={{
              ...StyleSheet.absoluteFill,
              backgroundColor: 'rgba(14,17,22,0.85)',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <Text style={[styles.h2, { textAlign: 'center' }]}>Hiders are hiding…</Text>
            <Text style={[styles.muted, { textAlign: 'center', marginTop: 8 }]}>
              Close your eyes and count. Their first location ping arrives when the hunt starts.
            </Text>
          </View>
        )}
      </View>

      <View style={{ maxHeight: 220, padding: 12, gap: 8 }}>
        {error && <Text style={styles.error}>{error}</Text>}
        <FlatList
          data={hiderList}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => {
            const ping = pingFor(item.id);
            const dist = ping && myPos ? Math.round(distanceMeters(myPos, ping)) : null;
            return (
              <View style={[styles.row, { minHeight: 32 }]}>
                <Text
                  style={[
                    styles.rowLabel,
                    item.status === 'caught' && { textDecorationLine: 'line-through', color: colors.muted },
                  ]}
                >
                  {item.name}
                </Text>
                <Text style={styles.muted}>
                  {item.status === 'caught'
                    ? 'caught'
                    : ping
                      ? `${dist != null ? `${dist} m · ` : ''}${formatAgo(now - ping.at)}`
                      : 'no ping yet'}
                </Text>
              </View>
            );
          }}
        />
        <Button
          title="Scan hider's QR to catch"
          onPress={() => setScanning(true)}
          disabled={phase !== 'hunting'}
        />
      </View>

      <CatchScanner
        visible={scanning}
        onClose={() => setScanning(false)}
        room={room}
        players={players}
        hunterId={me.id}
      />
    </View>
  );
}
