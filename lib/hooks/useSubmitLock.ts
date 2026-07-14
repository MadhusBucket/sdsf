"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Prevents double-submit: concurrent clicks are ignored until the in-flight
 * action finishes. Uses a ref so the lock is synchronous (before re-render).
 */
export function useSubmitLock() {
  const lockedRef = useRef(false);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (action: () => Promise<void>) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      lockedRef.current = false;
      setBusy(false);
    }
  }, []);

  return { busy, run } as const;
}
