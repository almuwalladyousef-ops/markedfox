import Link from "next/link";

import { FoxMark } from "@/components/ui";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-bg px-4 py-12 text-ink">
      <Link href="/" className="flex items-center gap-2.5">
        <FoxMark className="h-8" />
        <span className="font-display text-[22px] font-bold tracking-[-0.02em]">
          MarkedFox
        </span>
      </Link>
      <div className="w-full max-w-[392px] rounded-2xl border border-line bg-panel p-6 shadow-e2">
        {children}
      </div>
    </main>
  );
}
