import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Input, Label, colors, styles } from '../components/ui';
import { CODE_LENGTH, isValidCode, normalizeCode } from '../lib/game';
import { createRoom, joinRoom } from '../lib/rooms';
import { useSession } from '../lib/session';

export default function Home() {
  const { uid, name, setName, lastRoom, setLastRoom, ready, error: sessionError } = useSession();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const nameOk = trimmed.length >= 1 && trimmed.length <= 20;

  async function onCreate() {
    if (!uid) return;
    setBusy('create');
    setError(null);
    try {
      const newCode = await createRoom(uid, trimmed);
      setLastRoom(newCode);
      router.push(`/room/${newCode}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function onJoin(target = normalizeCode(code)) {
    if (!uid) return;
    if (!isValidCode(target)) {
      setError(`Room codes are ${CODE_LENGTH} letters/numbers.`);
      return;
    }
    setBusy('join');
    setError(null);
    try {
      await joinRoom(target, uid, trimmed);
      setLastRoom(target);
      router.push(`/room/${target}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return (
      <View style={[styles.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ marginTop: 24, marginBottom: 8 }}>
            <Text style={styles.title}>HUNT</Text>
            <Text style={styles.muted}>Hide. Get pinged. Don’t get caught.</Text>
          </View>

          {sessionError && (
            <Card style={{ borderColor: colors.danger }}>
              <Text style={styles.error}>{sessionError}</Text>
            </Card>
          )}

          <Card>
            <Label>Your name</Label>
            <Input
              value={name}
              onChangeText={setName}
              placeholder="e.g. Jithin"
              maxLength={20}
              autoCorrect={false}
            />
          </Card>

          <Card>
            <Label>Host a hunt</Label>
            <Text style={styles.muted}>Create a room and share the code with your friends.</Text>
            <Button
              title="Create room"
              onPress={onCreate}
              disabled={!uid || !nameOk || busy !== null}
              loading={busy === 'create'}
            />
          </Card>

          <Card>
            <Label>Join a hunt</Label>
            <Input
              value={code}
              onChangeText={(t) => setCode(normalizeCode(t))}
              placeholder="ROOM CODE"
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={CODE_LENGTH}
              style={{ fontSize: 22, letterSpacing: 6, textAlign: 'center', fontWeight: '700' }}
            />
            <Button
              title="Join room"
              variant="secondary"
              onPress={() => onJoin()}
              disabled={!uid || !nameOk || code.length !== CODE_LENGTH || busy !== null}
              loading={busy === 'join'}
            />
            {lastRoom && (
              <Button
                title={`Rejoin ${lastRoom}`}
                variant="secondary"
                onPress={() => onJoin(lastRoom)}
                disabled={!uid || !nameOk || busy !== null}
              />
            )}
          </Card>

          {!nameOk && <Text style={styles.muted}>Enter a name to get started.</Text>}
          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
