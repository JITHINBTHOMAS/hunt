import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import type { PermissionState } from './usePinger';

/** Live position of this phone (foreground only). */
export function useMyPosition(permission: PermissionState) {
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (permission !== 'granted') return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    Location.watchPositionAsync(
      { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 5000 },
      (l) => setPos({ lat: l.coords.latitude, lng: l.coords.longitude }),
    )
      .then((s) => {
        if (cancelled) s.remove();
        else sub = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [permission]);

  return pos;
}
