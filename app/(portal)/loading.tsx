export default function PortalLoading() {
  return (
    <div className="flex flex-col gap-6 animate-pulse" role="status" aria-label="Loading page">
      <div className="h-8 w-48 bg-zinc-800 rounded-lg" />
      <div className="h-4 w-72 bg-zinc-800/60 rounded" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-zinc-800" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-96 rounded-xl bg-zinc-800" />
        <div className="h-96 rounded-xl bg-zinc-800" />
      </div>
      <span className="sr-only">Loading page…</span>
    </div>
  );
}
