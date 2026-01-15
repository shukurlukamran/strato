"use client";

export function ResourceDisplay({ resources }: { resources: Record<string, number> }) {
  const entries = Object.entries(resources);
  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="text-sm font-semibold">Resources</div>
      {entries.length === 0 ? (
        <div className="mt-2 text-sm text-gray-600">No tracked resources yet.</div>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {entries.map(([k, v]) => (
            <li key={k} className="flex justify-between">
              <span className="text-gray-700">{k}</span>
              <span className="font-medium">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

