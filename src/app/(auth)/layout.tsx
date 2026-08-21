import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-panel px-4 py-12 text-ink">
      <Link href="/" className="text-2xl font-bold tracking-tight">
        MarkedFox
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-2xl">
        {children}
      </div>
    </main>
  );
}
