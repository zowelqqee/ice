import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-start justify-center gap-8 px-[var(--gutter)]">
      <p className="eyebrow">404</p>
      <h1 className="display text-[18vw] italic md:text-[11vw]">Off the ice.</h1>
      <Link href="/" className="border border-ice px-6 py-3 font-mono text-[12px] uppercase tracking-[0.24em] hover:bg-ice hover:text-ink">
        Back to the rink
      </Link>
    </main>
  );
}
