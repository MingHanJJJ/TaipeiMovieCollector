import { Suspense } from "react";
import { connection } from "next/server";
import { FilterBar } from "@/components/FilterBar";
import { MovieCard } from "@/components/MovieCard";
import { KIND_CLASS, KIND_LABEL } from "@/components/TimelineMatrix";
import { getDayScreenings, lastSyncAt, listAvailableDates, listCinemas } from "@/lib/screenings";
import { axisFor, groupByMovie, isIsoDate, minutesOfDay, shortCinemaName, taipeiToday, type FormatKind } from "@/lib/timeline";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function Home({ searchParams }: { searchParams: Promise<SP> }) {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-16">
      <header className="py-5">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">台北電影場次比對</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">勾選影城,在同一條時間軸上比較場次。點場次可前往威秀訂票頁。</p>
      </header>
      <Suspense fallback={<Skeleton />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="載入中">
      <div className="h-36 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
      <div className="mt-4 h-60 rounded-xl bg-neutral-200 dark:bg-neutral-800" />
    </div>
  );
}

async function Results({ searchParams }: { searchParams: Promise<SP> }) {
  await connection(); // request-time: depends on "now" and live DB data
  const sp = await searchParams;
  const [cinemas, dates, synced] = await Promise.all([listCinemas(), listAvailableDates(), lastSyncAt()]);
  const today = taipeiToday();

  const dateParam = one(sp.date);
  const date = isIsoDate(dateParam) ? dateParam : dates.includes(today) ? today : (dates[0] ?? today);
  const dateOptions = dates.includes(date) ? dates : [date, ...dates].sort();

  const allCodes = cinemas.map((c) => c.code);
  const cParam = one(sp.c);
  const hasCinemaParam = cParam !== undefined;
  const selected = cParam === undefined ? allCodes : cParam.split(",").filter((c) => allCodes.includes(c));
  const q = (one(sp.q) ?? "").trim();

  const rows = await getDayScreenings(date, selected);
  const needle = q.toLowerCase();
  const filtered = needle ? rows.filter((r) => r.titleZh.toLowerCase().includes(needle) || (r.titleEn ?? "").toLowerCase().includes(needle)) : rows;
  const groups = groupByMovie(filtered, date, allCodes);
  const axis = axisFor(groups);
  const nowMin = date === today ? minutesOfDay(new Date(), date) : null;
  const sessions = groups.reduce((n, g) => n + g.sessionCount, 0);

  return (
    <>
      <FilterBar
        cinemas={cinemas.map((c) => ({ code: c.code, short: shortCinemaName(c.name) }))}
        selected={selected}
        hasCinemaParam={hasCinemaParam}
        date={date}
        dates={dateOptions}
        today={today}
        q={q}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        <span>
          {groups.length} 部電影 · {sessions} 場次 · {selected.length} 間影城
        </span>
        <span className="flex flex-wrap items-center gap-2" aria-label="圖例">
          {(Object.keys(KIND_LABEL) as FormatKind[]).map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className={`inline-block h-3 w-3 rounded-sm ring-1 ring-inset ${KIND_CLASS[k]}`} />
              {KIND_LABEL[k]}
            </span>
          ))}
          {nowMin !== null && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 border-l-2 border-rose-500/70" />
              現在
            </span>
          )}
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {selected.length === 0 ? (
          <EmptyState title="請至少勾選一間影城" hint="使用上方的影城按鈕,或按「全選」。" />
        ) : groups.length === 0 ? (
          <EmptyState title="這一天沒有符合的場次" hint={q ? "試試清除片名搜尋,或換一天、多勾幾間影城。" : "換一天,或多勾幾間影城。"} />
        ) : (
          groups.map((g) => <MovieCard key={g.movieId} group={g} axis={axis} nowMin={nowMin} />)
        )}
      </div>

      <footer className="mt-8 text-xs text-neutral-500 dark:text-neutral-400">
        場次資料來源:威秀影城官網{synced ? `,最後同步 ${synced.toLocaleString("zh-TW", { timeZone: "Asia/Taipei", hour12: false })}` : ""}。影城通常每週更新一次場次。海報與電影資料:TMDB(This product uses the TMDB API but is not endorsed or certified by TMDB.)
      </footer>
    </>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-xl border border-dashed border-neutral-300 p-10 text-center dark:border-neutral-700">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">{hint}</p>
    </div>
  );
}
