"use client";

import { useState } from "react";
import { Gate } from "./Gate";
import { Hero } from "./hero/Hero";
import type { Dictionary } from "@/i18n";

/** Enter screen + hero: the gate waits for the hero scene to be ready. */
export function HomeIntro({ t }: { t: Dictionary }) {
  const [ready, setReady] = useState(false);
  return (
    <>
      <Gate t={t.gate} ready={ready} />
      <Hero t={t.hero} onReady={() => setReady(true)} />
    </>
  );
}
