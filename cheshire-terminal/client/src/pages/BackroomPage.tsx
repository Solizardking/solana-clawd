import { BackroomPanel } from "@/components/BackroomPanel";

export default function BackroomPage() {
  return (
    <main className="mx-auto w-full max-w-7xl py-6">
      <div className="mb-5 text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-200/70">CLAWD live system</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white sm:text-5xl">Backroom Stream</h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-purple-100/60">
          Live CLAWD Infinite Backroom conversation with Dreams of an Electric Mind stories beside the stream.
        </p>
      </div>

      <BackroomPanel />
    </main>
  );
}
