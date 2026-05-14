'use client';

import { useEffect } from 'react';

export function HeartbeatProvider() {
  useEffect(() => {
    const send = () => fetch('/api/users/heartbeat', { method: 'POST' }).catch(() => {});
    send();
    const interval = setInterval(send, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  return null;
}
