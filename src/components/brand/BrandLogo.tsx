import { CLEF_CENTER, LOGO_CLEF, LOGO_LETTERS, LOGO_SWOOSH, LOGO_VIEWBOX } from "./logo";

/** The logo as vector parts (clef, lettering, swoosh), each addressable for animation. */
export function BrandLogo({ className, clefClassName }: { className?: string; clefClassName?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} aria-hidden focusable="false" overflow="visible">
      <g data-swoosh>
        <path d={LOGO_SWOOSH} fill="currentColor" />
      </g>
      <g data-letters>
        <path d={LOGO_LETTERS} fill="currentColor" />
      </g>
      <g data-clef className={clefClassName} style={{ transformOrigin: `${CLEF_CENTER[0]}px ${CLEF_CENTER[1]}px`, transformBox: "view-box" }}>
        <path d={LOGO_CLEF} fill="currentColor" />
      </g>
    </svg>
  );
}
