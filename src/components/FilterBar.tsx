"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";

export interface CinemaOption {
  code: string;
  short: string;
}

interface Props {
  cinemas: CinemaOption[];
  selected: string[];
  /** true when the URL already carries a `c=` param (so we must not override it from localStorage) */
  hasCinemaParam: boolean;
  date: string;
  dates: string[];
  today: string;
  q: string;
}

const STORAGE_KEY = "tmc:cinemas";

function buildHref(date: string, selected: string[], all: string[], q: string): string {
  const p = new URLSearchParams();
  p.set("date", date);
  const isAll = selected.length === all.length && all.every((c) => selected.includes(c));
  if (!isAll) p.set("c", selected.join(","));
  if (q.trim()) p.set("q", q.trim());
  return `/?${p.toString()}`;
}

const weekday = new Intl.DateTimeFormat("zh-TW", { weekday: "narrow", timeZone: "Asia/Taipei" });
function dateLabel(d: string): { md: string; wd: string } {
  const dt = new Date(`${d}T12:00:00+08:00`);
  return { md: `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`, wd: weekday.format(dt) };
}

export function FilterBar({ cinemas, selected, hasCinemaParam, date, dates, today, q }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optSelected, setOptSelected] = useOptimistic(selected);
  const [query, setQuery] = useState(q);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const all = cinemas.map((c) => c.code);

  function go(nextSelected: string[], nextQuery = query) {
    startTransition(() => {
      setOptSelected(nextSelected);
      router.replace(buildHref(date, nextSelected, all, nextQuery), { scroll: false });
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSelected));
    } catch {
      /* storage unavailable: selection just won't persist */
    }
  }

  // First visit without ?c=: restore the user's last cinema selection.
  useEffect(() => {
    if (hasCinemaParam) return;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as string[] | null;
      const valid = Array.isArray(saved) ? saved.filter((c) => all.includes(c)) : [];
      if (valid.length > 0 && valid.length < all.length) router.replace(buildHref(date, valid, all, q), { scroll: false });
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle(code: string) {
    go(optSelected.includes(code) ? optSelected.filter((c) => c !== code) : all.filter((c) => c === code || optSelected.includes(c)));
  }

  function onQuery(v: string) {
    setQuery(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => go(optSelected, v), 300);
  }

  return (
    <div className={`sm:sticky sm:top-0 z-30 -mx-4 border-b border-black/10 bg-white/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border dark:border-white/10 dark:bg-neutral-900/90 ${pending ? "opacity-70" : ""}`}>
      {/* dates */}
      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="日期">
        {dates.map((d) => {
          const { md, wd } = dateLabel(d);
          const active = d === date;
          return (
            <Link
              key={d}
              href={buildHref(d, optSelected, all, query)}
              scroll={false}
              role="tab"
              aria-selected={active}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-center text-sm leading-tight transition-colors ${
                active ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900" : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              }`}
            >
              <span className="block font-medium tabular-nums">{md}</span>
              <span className="block text-[11px] opacity-70">{d === today ? "今天" : `週${wd}`}</span>
            </Link>
          );
        })}
      </div>

      {/* cinemas */}
      <fieldset className="mt-2 flex flex-wrap items-center gap-1.5">
        <legend className="sr-only">顯示影城</legend>
        {cinemas.map((c) => (
          <label
            key={c.code}
            className="cursor-pointer rounded-full border border-neutral-300 px-3 py-1 text-xs transition-colors select-none has-[:checked]:border-sky-600 has-[:checked]:bg-sky-600 has-[:checked]:text-white has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-sky-500 dark:border-neutral-600"
          >
            <input type="checkbox" className="sr-only" checked={optSelected.includes(c.code)} onChange={() => toggle(c.code)} />
            {c.short}
          </label>
        ))}
        <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-600" aria-hidden />
        <button type="button" onClick={() => go(all)} className="text-xs text-sky-700 hover:underline dark:text-sky-400">
          全選
        </button>
        <button type="button" onClick={() => go([])} className="text-xs text-sky-700 hover:underline dark:text-sky-400">
          清除
        </button>
      </fieldset>

      {/* search */}
      <div className="mt-2">
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="搜尋片名…"
          aria-label="搜尋片名"
          className="w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-neutral-400 focus:border-sky-500 sm:max-w-xs dark:border-neutral-600"
        />
      </div>
    </div>
  );
}
