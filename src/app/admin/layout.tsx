import type { Metadata } from "next";
import Link from "next/link";
import { currentAdmin } from "@/lib/auth";
import { logoutAction } from "./actions";

export const metadata: Metadata = {
  title: "Tour admin",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export const dynamic = "force-dynamic";

/** Bare frame for the admin: no site shell, no motion, readable on a phone. */
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await currentAdmin();
  return (
    <div className="admin min-h-svh bg-[#070a10] font-sans text-[15px] text-[#e6edf5]">
      <header className="sticky top-0 z-10 border-b border-[#1c2738] bg-[#070a10]/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/admin" className="font-medium tracking-wide">
            Musical on Ice <span className="text-[#8fa3b8]">· Tour events</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-[#8fa3b8]">
            <a href="/" target="_blank" rel="noopener" className="hover:text-white">
              View site
            </a>
            {user && (
              <form action={logoutAction}>
                <button type="submit" className="hover:text-white">
                  Sign out
                </button>
              </form>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 pb-24">{children}</main>
    </div>
  );
}
