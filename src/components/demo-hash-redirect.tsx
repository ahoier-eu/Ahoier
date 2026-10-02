"use client";

import { useEffect } from "react";

const DEMO_TABS = new Set(["board", "meetings", "community", "messages", "profile"]);

export function DemoHashRedirect() {
  useEffect(() => {
    const tab = window.location.hash.slice(1);
    if (DEMO_TABS.has(tab)) window.location.replace(`/demo#${tab}`);
  }, []);
  return null;
}
