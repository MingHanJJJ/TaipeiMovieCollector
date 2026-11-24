import { Poster } from "./Poster";
import { TimelineMatrix } from "./TimelineMatrix";
import type { Axis, MovieGroup } from "@/lib/timeline";

export function MovieCard({ group, axis, nowMin }: { group: MovieGroup; axis: Axis; nowMin: number | null }) {
  const runtime = group.runtimeMin ? `${Math.floor(group.runtimeMin / 60)}h${String(group.runtimeMin % 60).padStart(2, "0")}m` : null;
  const meta = [group.ratingClass, runtime].filter((m): m is string => !!m);
  return (
    <article className="rounded-xl border border-black/10 bg-white p-3 shadow-sm sm:p-4 dark:border-white/10 dark:bg-neutral-900">
      <header className="mb-3 flex gap-3">
        <Poster url={group.posterUrl} title={group.titleZh} className="w-[4.5rem] shrink-0 sm:w-[5.25rem]" />
        <div className="flex min-w-0 flex-1 flex-wrap content-start items-baseline gap-x-3 gap-y-0.5">
          <h2 className="text-base font-semibold sm:text-lg">{group.titleZh}</h2>
          {group.titleEn && <span className="text-xs text-neutral-500 dark:text-neutral-400">{group.titleEn}</span>}
          <span className="ml-auto flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            {meta.map((m) => (
              <span key={m}>{m}</span>
            ))}
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 tabular-nums dark:bg-neutral-800">{group.sessionCount} 場</span>
          </span>
        </div>
      </header>
      <TimelineMatrix group={group} axis={axis} nowMin={nowMin} />
    </article>
  );
}
