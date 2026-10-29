import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ensureSignedIn, isFirebaseConfigured } from './firebase';

const NAME_KEY = 'hunt.name';
const LAST_ROOM_KEY = 'hunt.lastRoom';

interface Session {
  uid: string | null;
  name: string;
  lastRoom: string | null;
  ready: boolean;
  error: string | null;
  setName: (name: string) => void;
  setLastRoom: (code: string | null) => void;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null);
  const [name, setNameState] = useState('');
  const [lastRoom, setLastRoomState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [n, r] = await Promise.all([
          AsyncStorage.getItem(NAME_KEY),
          AsyncStorage.getItem(LAST_ROOM_KEY),
        ]);
        if (n) setNameState(n);
        if (r) setLastRoomState(r);
        if (!isFirebaseConfigured) {
          setError('Firebase is not configured. Copy .env.example to .env and fill in your project keys.');
          return;
        }
        setUid(await ensureSignedIn());
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const setName = useCallback((n: string) => {
    setNameState(n);
    AsyncStorage.setItem(NAME_KEY, n).catch(() => {});
  }, []);

  const setLastRoom = useCallback((code: string | null) => {
    setLastRoomState(code);
    if (code) AsyncStorage.setItem(LAST_ROOM_KEY, code).catch(() => {});
    else AsyncStorage.removeItem(LAST_ROOM_KEY).catch(() => {});
  }, []);

  return (
    <SessionContext.Provider value={{ uid, name, lastRoom, ready, error, setName, setLastRoom }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession must be used inside SessionProvider');
  return s;
}
