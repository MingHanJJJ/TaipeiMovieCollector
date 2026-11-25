import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { ScreeningsResponse } from '../../core/models';

const STORAGE_KEY = 'tmc:cinemas';
const weekday = new Intl.DateTimeFormat('zh-TW', { weekday: 'narrow', timeZone: 'Asia/Taipei' });

@Component({
  selector: 'app-filter-bar',
  imports: [RouterLink],
  templateUrl: './filter-bar.html',
  // `contents` lets the sticky bar inside behave as if this wrapper element did not exist.
  host: { class: 'contents' },
})
export class FilterBar implements OnInit {
  readonly data = input.required<ScreeningsResponse>();
  readonly loading = input(false);

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private debounce?: ReturnType<typeof setTimeout>;

  /** Updates immediately on click, and is reset when new data arrives. */
  protected readonly selected = linkedSignal(() => this.data().selected);
  protected readonly query = signal('');

  protected readonly dates = computed(() => {
    const { dates, today } = this.data();
    return dates.map((value) => ({
      value,
      monthDay: `${Number(value.slice(5, 7))}/${Number(value.slice(8, 10))}`,
      label: value === today ? '今天' : `週${weekday.format(new Date(`${value}T12:00:00+08:00`))}`,
    }));
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.debounce));
  }

  ngOnInit(): void {
    this.query.set(this.data().q);
    this.restoreSelection();
  }

  protected queryFor(date: string): Params {
    const selected = this.selected();
    const isAll = this.allCodes().every((code) => selected.includes(code));
    return {
      date,
      c: isAll ? null : selected.join(','), // null removes the parameter
      q: this.query().trim() || null,
    };
  }

  protected toggle(code: string): void {
    const current = this.selected();
    this.select(
      current.includes(code)
        ? current.filter((c) => c !== code)
        : this.allCodes().filter((c) => c === code || current.includes(c)),
    );
  }

  protected selectAll(): void {
    this.select(this.allCodes());
  }

  protected selectNone(): void {
    this.select([]);
  }

  protected onQuery(value: string): void {
    this.query.set(value);
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.select(this.selected()), 300);
  }

  private allCodes(): string[] {
    return this.data().cinemas.map((c) => c.code);
  }

  private select(codes: string[]): void {
    this.selected.set(codes);
    this.navigate();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
    } catch {
      // Storage unavailable: the selection just won't persist.
    }
  }

  private navigate(): void {
    void this.router.navigate([], {
      queryParams: this.queryFor(this.data().date),
      replaceUrl: true,
    });
  }

  /** First visit without `?c=`: restore the last cinema selection. */
  private restoreSelection(): void {
    if (this.route.snapshot.queryParamMap.has('c')) return;
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
      if (!Array.isArray(saved)) return;
      const valid = this.allCodes().filter((code) => saved.includes(code));
      if (valid.length > 0 && valid.length < this.allCodes().length) {
        this.selected.set(valid);
        this.navigate();
      }
    } catch {
      // Ignore unreadable storage.
    }
  }
}
