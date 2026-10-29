import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import QRCode from 'react-native-qrcode-svg';
import type { PermissionState } from '../hooks/usePinger';
import { usePings } from '../hooks/useRoom';
import { encodeCatchQr, formatAgo, hiders, latestPings } from '../lib/game';
import { getRoundCatchToken } from '../lib/rooms';
import type { GameProps } from './GameView';
import { Card, Label, colors, styles } from './ui';

export function HiderView({ room, players, me, now, phase }: GameProps & { permission: PermissionState }) {
  const [token, setToken] = useState<string | null>(null);
  const caught = me.status === 'caught';

  useEffect(() => {
    if (room.startedAt == null) return;
    getRoundCatchToken(room.code, me.id, room.startedAt).then(setToken).catch(() => setToken(null));
  }, [room.code, me.id, room.startedAt]);

  const showHunter = room.settings.revealHunter && phase === 'hunting';
  const { pings } = usePings(room.code, false, room.startedAt, showHunter);
  const hunterPings = useMemo(() => latestPings(pings), [pings]);
  const mapRef = useRef<MapView>(null);
  const newest = hunterPings[0];
  useEffect(() => {
    if (!newest) return;
    mapRef.current?.animateToRegion(
      { latitude: newest.lat, longitude: newest.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      500,
    );
  }, [newest?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const others = hiders(players).filter((p) => p.id !== me.id);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {caught ? (
        <Card style={{ alignItems: 'center' }}>
          <Text style={[styles.h2, { color: colors.danger }]}>You were caught!</Text>
          <Text style={styles.muted}>Stick around and watch the rest of the hunt.</Text>
        </Card>
      ) : (
        <Card style={{ alignItems: 'center' }}>
          <Label>Your catch code</Label>
          <Text style={[styles.muted, { textAlign: 'center' }]}>
            {phase === 'hiding'
              ? 'Go hide! Your location will be sent to the hunter when the hunt starts, then on every ping.'
              : 'If the hunter finds you, show them this code. Being scanned means you are out.'}
          </Text>
          <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: 12 }}>
            {token ? (
              <QRCode value={encodeCatchQr(room.code, me.id, token)} size={200} />
            ) : (
              <View style={{ width: 200, height: 200 }} />
            )}
          </View>
        </Card>
      )}

      {showHunter && (
        <Card style={{ height: 260, padding: 0, overflow: 'hidden' }}>
          <MapView ref={mapRef} style={{ flex: 1 }} showsUserLocation showsMyLocationButton>
            {hunterPings.map((p) => (
              <Marker
                key={p.playerId}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                title={`Hunter: ${p.name}`}
                description={formatAgo(now - p.at)}
                pinColor={colors.accent}
              />
            ))}
          </MapView>
        </Card>
      )}

      <Card>
        <Label>Other hiders</Label>
        {others.length === 0 && <Text style={styles.muted}>Just you. Good luck.</Text>}
        {others.map((p) => (
          <View key={p.id} style={styles.row}>
            <Text style={styles.rowLabel}>{p.name}</Text>
            <Text style={{ color: p.status === 'caught' ? colors.danger : colors.success }}>
              {p.status === 'caught' ? 'caught' : 'still hiding'}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
