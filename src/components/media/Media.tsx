"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaRef } from "@/lib/data";

/** AVIF → WebP → JPEG still. `src` is a path without extension. */
export function Still({
  src,
  alt = "",
  className,
  priority = false,
  style,
  width = 720,
  height = 900,
}: {
  src: string;
  alt?: string;
  className?: string;
  priority?: boolean;
  style?: React.CSSProperties;
  width?: number;
  height?: number;
}) {
  return (
    <picture>
      <source srcSet={`${src}.avif`} type="image/avif" />
      <source srcSet={`${src}.webp`} type="image/webp" />
      <img
        src={`${src}.jpg`}
        alt={alt}
        width={width}
        height={height}
        className={className}
        style={style}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : "auto"}
      />
    </picture>
  );
}

/**
 * Muted ambient loop. Loads nothing until it nears the viewport, plays only while visible,
 * and stays a still under prefers-reduced-motion.
 */
export function LoopVideo({
  media,
  className,
  alt = "",
  priority = false,
}: {
  media: MediaRef;
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(priority);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    const v = ref.current;
    if (!v || !media.video || reduced) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setNear(true);
          v.play().catch(() => {});
        } else v.pause();
      },
      { rootMargin: "25% 25%" },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [media.video, reduced]);

  if (!media.video || reduced) return <Still src={media.poster} alt={alt} className={className} priority={priority} />;

  return (
    <video
      ref={ref}
      className={className}
      muted
      loop
      playsInline
      preload={near ? "auto" : "none"}
      poster={`${media.poster}.jpg`}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      {near && (media.formats ?? ["webm", "mp4"]).includes("webm") && <source src={`${media.video}.webm`} type='video/webm; codecs="vp9"' />}
      {near && (media.formats ?? ["webm", "mp4"]).includes("mp4") && <source src={`${media.video}.mp4`} type="video/mp4" />}
    </video>
  );
}
