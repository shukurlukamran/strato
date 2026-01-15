import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-3xl font-semibold">Strato</h1>
      <p className="mt-2 text-gray-700">
        Global political country management strategy game. MVP: 6 imaginary countries, turn-based. Designed to scale to
        many countries + multiplayer later.
      </p>

      <div className="mt-6 flex gap-3">
        <Link className="rounded bg-black px-4 py-2 text-white hover:bg-gray-800" href="/new-game">
          Start new game
        </Link>
      </div>

      <div className="mt-10 rounded-lg border bg-white p-4 text-sm text-gray-700">
        <div className="font-semibold">Core differentiator</div>
        <div className="mt-2">
          Diplomacy is done through <span className="font-medium">free-form chat</span> with AI countries, then formalized
          into a <span className="font-medium">structured deal</span> both sides confirm.
        </div>
      </div>
    </main>
  );
}
