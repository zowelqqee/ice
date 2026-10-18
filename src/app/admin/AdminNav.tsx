"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/admin", label: "Tour dates", match: (p: string) => p === "/admin" || p.startsWith("/admin/events") },
  { href: "/admin/shows", label: "Shows", match: (p: string) => p.startsWith("/admin/shows") },
  { href: "/admin/music", label: "Music", match: (p: string) => p.startsWith("/admin/music") },
  { href: "/admin/texts", label: "Texts", match: (p: string) => p.startsWith("/admin/texts") },
  { href: "/admin/settings", label: "Settings", match: (p: string) => p.startsWith("/admin/settings") },
];

/** Sections of the admin; scrolls sideways on a phone. */
export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="Admin sections" className="border-b border-[#1c2738]">
      <ul className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-4 text-sm">
        {ITEMS.map((i) => {
          const on = i.match(path);
          return (
            <li key={i.href}>
              <Link
                href={i.href}
                aria-current={on ? "page" : undefined}
                className={`block whitespace-nowrap border-b-2 px-3 py-2.5 ${on ? "border-[#5cf2ff] text-white" : "border-transparent text-[#8fa3b8] hover:text-white"}`}
              >
                {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
