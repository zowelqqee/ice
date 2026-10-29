"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { audio } from "@/lib/audio/engine";
import { BladeLink } from "./shell/Transition";
import { useLenis } from "./SmoothScroll";
import type { Dictionary } from "@/i18n";

function SoundButton({ t }: { t: Dictionary["sound"] }) {
  const muted = useSyncExternalStore(audio.subscribe, () => audio.muted, () => true);
  return (
    <button
      type="button"
      data-sound-toggle
      onClick={() => audio.toggle()}
      aria-pressed={!muted}
      aria-label={muted ? t.unmute : t.mute}
      className="group flex h-10 w-10 items-center justify-center"
    >
      {/* five bars that breathe while sound is on, flat line when muted */}
      <span className="flex h-4 items-end gap-[3px]" aria-hidden>
        {[0.55, 1, 0.7, 0.9, 0.45].map((h, i) => (
          <span
            key={i}
            className="w-[2px] origin-bottom bg-ice transition-all duration-500 group-hover:bg-accent"
            style={{
              height: muted ? "2px" : `${h * 100}%`,
              animation: muted ? "none" : `eq 1.${2 + i}s ease-in-out ${i * 0.13}s infinite alternate`,
            }}
          />
        ))}
      </span>
    </button>
  );
}

export function Header({ t, tSound }: { t: Dictionary["nav"]; tSound: Dictionary["sound"] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const lenis = useLenis();
  const links: [string, string][] = [
    ["/#shows", t.shows],
    ["/#music", t.music],
    ["/#tour", t.tour],
  ];

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (open) lenis?.stop();
    else lenis?.start();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lenis]);

  // on the home page, anchors scroll smoothly instead of navigating
  const onAnchor = (e: React.MouseEvent, href: string) => {
    if (pathname !== "/") return;
    e.preventDefault();
    setOpen(false);
    const id = href.split("#")[1];
    const el = document.getElementById(id);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { duration: 1.6 });
    else el.scrollIntoView({ behavior: "smooth" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-center justify-between px-[var(--gutter)] pt-5 pb-6 [background:linear-gradient(to_bottom,rgba(11,29,46,0.55),rgba(11,29,46,0))]">
        <BladeLink href="/" className="pointer-events-auto" aria-label="Musical on Ice, home">
          <Image src="/brand/logo-white.webp" alt="" width={1323} height={1005} className="h-auto w-[64px] sm:w-[76px]" priority />
        </BladeLink>
        <nav aria-label="Primary" className="pointer-events-auto hidden items-center gap-9 md:flex">
          {links.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              onClick={(e) => onAnchor(e, href)}
              className="font-mono text-[11px] uppercase tracking-[0.24em] text-ice transition-colors hover:text-accent"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3">
          <SoundButton t={tSound} />
          <Link
            href="/#tour"
            onClick={(e) => onAnchor(e, "/#tour")}
            className="hidden border border-ice px-5 py-2.5 font-mono text-[11px] uppercase tracking-[0.24em] text-ice transition-colors hover:bg-ice hover:text-ink sm:inline-block"
          >
            {t.tickets}
          </Link>
          <button
            type="button"
            className="flex h-10 w-10 flex-col items-center justify-center gap-[6px] md:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <span className={`h-px w-6 bg-ice transition-transform duration-500 ${open ? "translate-y-[3.5px] rotate-[20deg]" : ""}`} />
            <span className={`h-px w-6 bg-ice transition-transform duration-500 ${open ? "-translate-y-[3.5px] -rotate-[20deg]" : ""}`} />
          </button>
        </div>
      </header>

      {/* mobile menu: a full sheet of ice with the sections set large */}
      <div
        id="mobile-menu"
        className={`fixed inset-0 z-40 flex flex-col justify-center gap-2 bg-ink/95 px-[var(--gutter)] backdrop-blur-sm transition-[clip-path] duration-700 ease-[var(--ease-blade)] md:hidden ${
          open ? "[clip-path:polygon(0_0,100%_0,100%_100%,0_100%)]" : "pointer-events-none [clip-path:polygon(0_0,100%_0,100%_0,0_0)]"
        }`}
        aria-hidden={!open}
      >
        {[...links, ["/#tour", t.tickets] as [string, string]].map(([href, label], i) => (
          <Link
            key={label}
            href={href}
            tabIndex={open ? 0 : -1}
            onClick={(e) => onAnchor(e, href)}
            className="display block py-1 text-[17vw] text-ice"
            style={{ transitionDelay: `${i * 60}ms` }}
          >
            {label}
          </Link>
        ))}
      </div>
    </>
  );
}
