export default function AdminLoading() {
  return (
    <div className="min-h-screen bg-[#071209] p-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between mb-8">
        <div className="h-7 w-48 bg-white/8 rounded-xl" />
        <div className="h-8 w-28 bg-white/5 rounded-xl" />
      </div>

      {/* Stat cards row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white/5 border border-white/8 rounded-2xl p-5 space-y-3">
            <div className="h-4 w-20 bg-white/8 rounded" />
            <div className="h-8 w-16 bg-white/10 rounded" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="bg-white/3 border border-white/8 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/8">
          <div className="h-5 w-32 bg-white/8 rounded" />
        </div>
        <div className="divide-y divide-white/5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="px-5 py-4 flex items-center gap-4">
              <div className="h-4 w-28 bg-white/6 rounded" />
              <div className="h-4 w-20 bg-white/4 rounded" />
              <div className="h-4 w-24 bg-white/6 rounded ml-auto" />
              <div className="h-6 w-16 bg-white/5 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
