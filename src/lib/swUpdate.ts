import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

type Listener = () => void;

const listeners = new Set<Listener>();
let initialized = false;
let updateAvailableState = false;
let isUpdatingState = false;
let updateFn: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | undefined;

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function initVexoraUpdateWatcher() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;

  updateFn = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateAvailableState = true;
      notify();
    },
    onRegisteredSW(_swUrl, registration) {
      swRegistration = registration;
      if (!registration) return;

      const check = () => {
        registration.update().catch(() => {
          // Ignore transient offline errors
        });
      };

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          check();
        }
      });

      window.setInterval(check, 5 * 60 * 1000);
    },
  });
}

export async function applyVexoraUpdate() {
  if (isUpdatingState) return;
  isUpdatingState = true;
  notify();

  try {
    if (updateFn) {
      await updateFn(true);
    }
  } catch {
    // Fallback below
  }

  window.setTimeout(() => {
    window.location.reload();
  }, 1200);
}

export async function checkForVexoraUpdates(): Promise<boolean> {
  if (!swRegistration) return false;
  try {
    await swRegistration.update();
    return updateAvailableState;
  } catch {
    return false;
  }
}

export function useVexoraUpdate() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

  return {
    updateAvailable: updateAvailableState,
    isUpdating: isUpdatingState,
    applyUpdate: applyVexoraUpdate,
    checkForUpdates: checkForVexoraUpdates,
  };
}
