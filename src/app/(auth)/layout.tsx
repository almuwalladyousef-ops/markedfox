import Link from "next/link";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-neutral-950 px-4 py-12 text-neutral-50">
      <Link href="/" className="text-2xl font-bold tracking-tight">
        MarkedFox
      </Link>
      <div className="w-full max-w-sm rounded-xl border border-neutral-900 bg-neutral-950 p-6 shadow-2xl">
        {children}
      </div>
    </main>
  );
}
