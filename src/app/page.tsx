import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-sky-700">
        Baptize The World
      </p>
      <h1 className="text-4xl font-bold sm:text-5xl">Baptism In Your Pocket</h1>
      <p className="text-lg text-slate-600">
        Pastors register their church and report baptisms with Baptize The
        World by texting on WhatsApp.
      </p>
      <Link
        href="/dashboard"
        className="w-fit rounded-lg bg-sky-700 px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-sky-800"
      >
        Open the live dashboard
      </Link>
    </main>
  );
}
