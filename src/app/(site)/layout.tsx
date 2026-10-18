import { Shell } from "@/components/shell/Shell";
import { Footer } from "@/components/Footer";
import { getDict, getSiteSettings } from "@/lib/content";

/** The public site: smooth scroll, header, transitions, cursor and footer around every page. */
export default async function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [t, settings] = await Promise.all([getDict(), getSiteSettings()]);
  return (
    <Shell t={t}>
      <div id="content">{children}</div>
      <Footer t={t.footer} site={settings} />
    </Shell>
  );
}
