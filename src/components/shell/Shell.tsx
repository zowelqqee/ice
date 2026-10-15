"use client";

import { SmoothScroll } from "../SmoothScroll";
import { Header } from "../Header";
import { TransitionLayer } from "./Transition";
import { FrostCursor } from "./FrostCursor";
import type { Dictionary } from "@/i18n";

/** Everything that lives across routes: smooth scroll, header, page transitions, frost cursor. */
export function Shell({ t, children }: { t: Dictionary; children: React.ReactNode }) {
  return (
    <SmoothScroll>
      <TransitionLayer>
        <a href="#content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[200] focus:bg-ice focus:px-4 focus:py-2 focus:text-ink">
          Skip to content
        </a>
        <Header t={t.nav} tSound={t.sound} />
        {children}
        <FrostCursor />
      </TransitionLayer>
    </SmoothScroll>
  );
}
