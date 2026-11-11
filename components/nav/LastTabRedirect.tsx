"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { lastListTab } from "./lastListTab";

/** Old /dashboard address: send the user to the list they had open last. */
export function LastTabRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(lastListTab());
  }, [router]);
  return null;
}
