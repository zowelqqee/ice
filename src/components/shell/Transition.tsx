"use client";

import { createContext, useCallback, useContext, useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { audio } from "@/lib/audio/engine";
import { useLenis } from "../SmoothScroll";

type Go = (href: string, accent?: string) => void;
const Ctx = createContext<Go>(() => {});
export const useBladeNavigate = () => useContext(Ctx);

/**
 * Page transition: a blade line slices the screen on a diagonal, two sheets of ice close over
 * the page, the route changes, and the sheets part again on the new page.
 */
export function TransitionLayer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const root = useRef<HTMLDivElement>(null);
  const pending = useRef(false);
  const lenis = useLenis();

  const go = useCallback<Go>(
    (href, accent = "#5cf2ff") => {
      const el = root.current;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!el || reduced || href === pathname) return router.push(href);
      pending.current = true;
      el.style.setProperty("--cut", accent);
      audio.bell(88, 0.04);
      const tl = gsap.timeline();
      tl.set(el, { autoAlpha: 1 })
        .set("[data-ta]", { yPercent: -101 })
        .set("[data-tb]", { yPercent: 101 })
        .set("[data-tline]", { attr: { x2: 0, y2: 64 }, autoAlpha: 1 })
        .to("[data-tline]", { attr: { x2: 100, y2: 36 }, duration: 0.35, ease: "power3.in" })
        .to("[data-ta]", { yPercent: 0, duration: 0.55, ease: "expo.inOut" }, "<0.1")
        .to("[data-tb]", { yPercent: 0, duration: 0.55, ease: "expo.inOut" }, "<")
        .add(() => router.push(href));
    },
    [pathname, router],
  );

  // reveal after the route changed
  useEffect(() => {
    const el = root.current;
    if (!el || !pending.current) return;
    pending.current = false;
    if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
    else window.scrollTo(0, 0);
    requestAnimationFrame(() => ScrollTrigger.refresh());
    gsap
      .timeline({ delay: 0.15 })
      .to("[data-ta]", { yPercent: -101, duration: 0.9, ease: "expo.inOut" })
      .to("[data-tb]", { yPercent: 101, duration: 0.9, ease: "expo.inOut" }, "<")
      .to("[data-tline]", { autoAlpha: 0, duration: 0.3 }, "<0.2")
      .set(el, { autoAlpha: 0 });
  }, [pathname, lenis]);

  return (
    <Ctx.Provider value={go}>
      {children}
      <div ref={root} aria-hidden className="pointer-events-none invisible fixed inset-0 z-[90] opacity-0">
        <div data-ta className="absolute inset-0 bg-ink" style={{ clipPath: "polygon(0 0,100% 0,100% 36%,0 64%)" }} />
        <div data-tb className="absolute inset-0 bg-ink" style={{ clipPath: "polygon(0 64%,100% 36%,100% 100%,0 100%)" }} />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          <line
            data-tline
            x1="0"
            y1="64"
            x2="0"
            y2="64"
            stroke="var(--cut)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
            style={{ filter: "drop-shadow(0 0 6px var(--cut))" }}
          />
        </svg>
      </div>
    </Ctx.Provider>
  );
}

/** Link that navigates with the blade transition (falls back to a normal link without JS). */
export function BladeLink({
  href,
  accent,
  className,
  children,
  ...rest
}: { href: string; accent?: string; className?: string; children: React.ReactNode } & Omit<
  React.AnchorHTMLAttributes<HTMLAnchorElement>,
  "href"
>) {
  const go = useBladeNavigate();
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(href, accent);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}
