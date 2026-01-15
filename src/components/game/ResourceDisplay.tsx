"use client";

export function ResourceDisplay({ resources }: { resources: Record<string, number> }) {
  const entries = Object.entries(resources);
  
  const resourceIcons: Record<string, string> = {
    oil: "🛢️",
    food: "🌾",
    minerals: "⛏️",
    technology: "🔬",
  };

  return (
    <div className="rounded-lg border border-white/10 bg-gradient-to-br from-slate-800/90 to-slate-900/90 p-4 shadow-lg">
      <div className="mb-3 text-sm font-semibold text-white">Resources</div>
      {entries.length === 0 ? (
        <div className="text-sm text-white/60">No resources tracked</div>
      ) : (
        <div className="space-y-2">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="flex items-center justify-between rounded border border-white/10 bg-slate-800/50 px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">{resourceIcons[key] || "📦"}</span>
                <span className="text-sm capitalize text-white/90">{key}</span>
              </div>
              <span className="font-bold text-white">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
