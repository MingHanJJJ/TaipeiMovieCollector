import { FormatKind } from './models';

export const KIND_CLASS: Record<FormatKind, string> = {
  standard:
    'bg-sky-100 text-sky-900 ring-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-700',
  imax: 'bg-violet-100 text-violet-900 ring-violet-300 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-700',
  '4dx':
    'bg-orange-100 text-orange-900 ring-orange-300 dark:bg-orange-950 dark:text-orange-100 dark:ring-orange-700',
  live: 'bg-emerald-100 text-emerald-900 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:ring-emerald-700',
  premium:
    'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-700',
};

export const KINDS: { kind: FormatKind; label: string }[] = [
  { kind: 'standard', label: '數位 / 3D' },
  { kind: 'imax', label: 'IMAX' },
  { kind: '4dx', label: '4DX' },
  { kind: 'live', label: '直播 / 特別場' },
  { kind: 'premium', label: 'TITAN / GC / MUCROWN' },
];
