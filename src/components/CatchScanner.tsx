import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import { Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Player, Room } from '../lib/game';
import { catchFromQr } from '../lib/rooms';
import { Button, colors, styles } from './ui';

export function CatchScanner({
  visible,
  onClose,
  room,
  players,
  hunterId,
}: {
  visible: boolean;
  onClose: () => void;
  room: Room;
  players: Player[];
  hunterId: string;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const handling = useRef(false);
  const lastData = useRef<string | null>(null);

  async function onScan(data: string) {
    if (handling.current || data === lastData.current) return;
    handling.current = true;
    lastData.current = data;
    const result = await catchFromQr(room.code, hunterId, data, players);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setMessage({ ok: true, text: `Caught ${result.name}!` });
      setTimeout(() => {
        setMessage(null);
        lastData.current = null;
        onClose();
      }, 1200);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setMessage({ ok: false, text: result.reason });
      // Allow scanning the same code again after a moment.
      setTimeout(() => (lastData.current = null), 2000);
    }
    handling.current = false;
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.screen, { padding: 16, gap: 16 }]}>
        <Text style={styles.h2}>Scan to catch</Text>
        {!permission ? null : !permission.granted ? (
          <View style={{ gap: 12 }}>
            <Text style={styles.text}>Camera access is needed to scan a hider’s QR code.</Text>
            <Button title="Allow camera" onPress={requestPermission} />
          </View>
        ) : (
          <View style={{ flex: 1, borderRadius: 16, overflow: 'hidden' }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={visible ? (r) => onScan(r.data) : undefined}
            />
          </View>
        )}
        {message && (
          <Text style={{ color: message.ok ? colors.success : colors.danger, fontSize: 18, fontWeight: '700' }}>
            {message.text}
          </Text>
        )}
        <Button title="Close" variant="secondary" onPress={onClose} />
      </SafeAreaView>
    </Modal>
  );
}
