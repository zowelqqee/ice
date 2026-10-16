import { getDictionary } from "@/i18n";
import { Shell } from "@/components/shell/Shell";
import { Footer } from "@/components/Footer";

const t = getDictionary();

/** The public site: smooth scroll, header, transitions, cursor and footer around every page. */
export default function SiteLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Shell t={t}>
      <div id="content">{children}</div>
      <Footer t={t.footer} />
    </Shell>
  );
}
