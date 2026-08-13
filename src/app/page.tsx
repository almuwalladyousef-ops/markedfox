// Static placeholder. Deliberately imports nothing from src/lib so the page
// prerenders with zero environment variables set.
export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-950 text-neutral-50">
      <h1 className="text-5xl font-bold tracking-tight">MarkedFox</h1>
      <p className="text-lg text-neutral-400">
        Publish everywhere. Automate every DM.
      </p>
      <p className="text-sm text-neutral-600">Coming soon.</p>
    </main>
  );
}
