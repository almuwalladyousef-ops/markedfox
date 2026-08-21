import { SiteFooter } from "./_components/site-footer";
import { SiteHeader } from "./_components/site-header";

// Every public marketing page — landing, pricing, privacy, terms — shares
// this frame. Deliberately imports nothing from src/lib so the whole group
// prerenders with zero environment variables set.
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <SiteFooter />
    </div>
  );
}
