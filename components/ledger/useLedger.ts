"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { computeLedger } from "@/lib/ledger/compute";
import { fetchLedgerData, type LedgerData } from "@/lib/ledger/data";
import { createClient } from "@/lib/supabase/client";

/** Loads companies, invoices and payments (read only) and works out every balance. */
export function useLedger() {
  const [data, setData] = useState<LedgerData | null>(null);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let active = true;
    fetchLedgerData(createClient())
      .then((d) => active && setData(d))
      .catch((e) => {
        console.error(e);
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, [version]);

  const ledger = useMemo(() => (data ? computeLedger(data.invoices, data.payments, data.keyOf) : null), [data]);
  return { data, ledger, failed, reload };
}
