import { formatClock, formatKind, formatTier, shortCinemaName, type Axis, type FormatKind, type MovieGroup } from "@/lib/timeline";

export const PX_PER_HOUR = 60;
const LANE_H = 30;
const LABEL_W = 92;

export const KIND_CLASS: Record<FormatKind, string> = {
  standard: "bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-700",
  imax: "bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-700",
  "4dx": "bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:ring-orange-700",
  live: "bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-700",
  premium: "bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700",
};

export const KIND_LABEL: Record<FormatKind, string> = { standard: "數位 / 3D", imax: "IMAX", "4dx": "4DX", live: "直播 / 特別場", premium: "TITAN / GC / MUCROWN" };

const px = (min: number, axis: Axis) => ((min - axis.startMin) / 60) * PX_PER_HOUR;

export function TimelineMatrix({ group, axis, nowMin }: { group: MovieGroup; axis: Axis; nowMin: number | null }) {
  const hours = (axis.endMin - axis.startMin) / 60;
  const width = hours * PX_PER_HOUR;
  const hourMarks = Array.from({ length: hours + 1 }, (_, i) => axis.startMin + i * 60);
  const nowLeft = nowMin !== null && nowMin >= axis.startMin && nowMin <= axis.endMin ? px(nowMin, axis) : null;

  return (
    <div className="overflow-x-auto" role="table" aria-label={`${group.titleZh} 場次時間軸`}>
      <div style={{ width: width + LABEL_W }}>
        {/* hour header */}
        <div className="flex border-b border-black/10 text-[11px] text-neutral-500 dark:border-white/10 dark:text-neutral-400" role="row">
          <div className="sticky left-0 z-20 shrink-0 bg-white dark:bg-neutral-900" style={{ width: LABEL_W }} />
          <div className="relative h-6" style={{ width }}>
            {hourMarks.slice(0, -1).map((m) => (
              <span
                key={m}
                className={`absolute top-1 pl-1 tabular-nums ${m >= 1440 ? "text-neutral-400 dark:text-neutral-500" : ""}`}
                style={{ left: px(m, axis) }}
              >
                {formatClock(m).slice(0, 2)}
              </span>
            ))}
          </div>
        </div>

        {group.rows.map((row) => (
          <div key={row.cinemaCode} className="flex border-b border-black/5 last:border-b-0 dark:border-white/5" role="row">
            <div
              className="sticky left-0 z-10 flex shrink-0 items-center bg-white pr-2 pl-1 text-xs font-medium text-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              style={{ width: LABEL_W, minHeight: row.lanes * LANE_H + 8 }}
              role="rowheader"
            >
              {shortCinemaName(row.cinemaName)}
            </div>
            <div className="relative" style={{ width, height: row.lanes * LANE_H + 8 }}>
              {hourMarks.map((m) => (
                <span key={m} className="absolute top-0 bottom-0 border-l border-black/5 dark:border-white/5" style={{ left: px(m, axis) }} />
              ))}
              {nowLeft !== null && <span className="absolute top-0 bottom-0 z-[5] border-l-2 border-rose-500/70" style={{ left: nowLeft }} />}
              {row.blocks.map((b) => {
                const kind = formatKind(b.format);
                const tag = [formatTier(b.format) === 2 ? "" : b.format.replace(/\s*3D$/i, ""), b.language ?? ""].filter(Boolean).join("·");
                const past = nowMin !== null && b.startMin < nowMin;
                const cls = `absolute flex items-center gap-1 overflow-hidden rounded-md px-1.5 text-[11px] leading-none whitespace-nowrap ring-1 ring-inset ${KIND_CLASS[kind]} ${past ? "opacity-40" : ""}`;
                const style = {
                  left: px(b.startMin, axis),
                  width: Math.max(((b.endMin - b.startMin) / 60) * PX_PER_HOUR - 2, 46),
                  top: 4 + b.lane * LANE_H,
                  height: LANE_H - 4,
                };
                const title = `${shortCinemaName(row.cinemaName)} ${b.time}–${formatClock(b.endMin)}\n${b.format}${b.language ? " · " + b.language : ""}`;
                const content = (
                  <>
                    <span className="font-semibold tabular-nums">{b.time}</span>
                    {tag && <span className="truncate opacity-80">{tag}</span>}
                  </>
                );
                return b.href ? (
                  <a
                    key={b.id}
                    href={b.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${cls} hover:brightness-95 focus-visible:outline-2 focus-visible:outline-sky-500`}
                    style={style}
                    title={title}
                  >
                    {content}
                  </a>
                ) : (
                  <span key={b.id} className={cls} style={style} title={title}>
                    {content}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
