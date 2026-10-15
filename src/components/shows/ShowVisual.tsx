import type { Show } from "@/lib/data";
import { LoopVideo, Still } from "../media/Media";

/**
 * The visual for a show: real footage when we have it, otherwise a light-and-ice composition in
 * the show's accent (same language for every unreleased production, one motif each).
 */
export function ShowVisual({
  show,
  variant = "card",
  className = "",
  priority = false,
}: {
  show: Show;
  variant?: "card" | "hero";
  className?: string;
  priority?: boolean;
}) {
  const media = variant === "hero" ? show.media.hero ?? show.media.card : show.media.card;
  if (media)
    return (
      <div className={`relative overflow-hidden bg-abyss ${className}`}>
        {media.video ? (
          <LoopVideo media={media} priority={priority} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Still
            src={media.poster}
            priority={priority}
            className="absolute inset-0 h-full w-full object-cover animate-[drift_18s_ease-in-out_infinite_alternate]"
          />
        )}
        {/* accent grade: the show's colour pooled from below, ink from above */}
        <div
          aria-hidden
          className="absolute inset-0 mix-blend-soft-light"
          style={{ background: `linear-gradient(to top, ${show.accent}55, transparent 55%)` }}
        />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink/40 via-transparent to-ink/70" />
      </div>
    );
  return <Unreleased show={show} className={className} />;
}

function Unreleased({ show, className }: { show: Show; className: string }) {
  const a = show.accent;
  const motif =
    show.slug === "the-little-prince" ? "star" : show.slug === "through-the-looking-glass" ? "mirror" : "rings";
  return (
    <div className={`relative overflow-hidden bg-abyss ${className}`} aria-hidden>
      {/* frost grain */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.22] mix-blend-screen" preserveAspectRatio="none">
        <filter id={`frost-${show.slug}`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed={show.slug.length} />
          <feColorMatrix values="0 0 0 0 0.85  0 0 0 0 0.95  0 0 0 0 1  0 0 0 1.4 -0.6" />
        </filter>
        <rect width="100%" height="100%" filter={`url(#frost-${show.slug})`} />
      </svg>
      {/* pool of light */}
      <div className="absolute inset-0" style={{ background: `radial-gradient(60% 45% at 50% 62%, ${a}40, transparent 70%)` }} />
      {/* blade traces */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 500" preserveAspectRatio="xMidYMid slice">
        {[60, 92, 128, 170].map((r, i) => (
          <ellipse key={r} cx="200" cy="330" rx={r * 1.6} ry={r * 0.42} fill="none" stroke={a} strokeOpacity={0.5 - i * 0.1} strokeWidth="0.6" />
        ))}
        {motif === "star" && (
          <g>
            <circle cx="290" cy="120" r="2.2" fill="#fff" />
            <circle cx="290" cy="120" r="18" fill={a} opacity="0.16" />
            <path d="M290 96 L290 144 M266 120 L314 120" stroke="#fff" strokeOpacity="0.7" strokeWidth="0.5" />
          </g>
        )}
        {motif === "mirror" && <line x1="200" y1="40" x2="200" y2="470" stroke={a} strokeOpacity="0.6" strokeWidth="0.6" />}
      </svg>
      {motif === "mirror" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="display text-[9vw] italic text-ice/10 [transform:scaleX(-1)]">Alice</span>
        </div>
      )}
      {motif === "rings" && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="display text-[14vw] text-transparent [-webkit-text-stroke:1px_rgba(234,246,255,0.18)]">
            {show.subtitle.split(" ").pop()}
          </span>
        </div>
      )}
    </div>
  );
}
