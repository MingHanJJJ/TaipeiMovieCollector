import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { catchError, map, of, scan, startWith, switchMap } from 'rxjs';
import { FilterBar } from '../../components/filter-bar/filter-bar';
import { MovieCard } from '../../components/movie-card/movie-card';
import { KINDS, KIND_CLASS } from '../../core/formats';
import { ScreeningsResponse } from '../../core/models';
import { ScreeningsService } from '../../core/screenings.service';

interface State {
  data?: ScreeningsResponse;
  loading: boolean;
  failed: boolean;
}

@Component({
  selector: 'app-home-page',
  imports: [FilterBar, MovieCard],
  templateUrl: './home.page.html',
  host: { class: 'flex flex-1 flex-col' },
})
export class HomePage {
  private readonly api = inject(ScreeningsService);
  private readonly route = inject(ActivatedRoute);

  protected readonly kinds = KINDS;
  protected readonly kindClass = KIND_CLASS;

  /** Reloads whenever the URL changes. The previous data stays visible while loading. */
  protected readonly state = toSignal(
    this.route.queryParamMap.pipe(
      // switchMap cancels the previous request if the URL changes again.
      switchMap((query) =>
        this.api.get(query).pipe(
          map((data): Partial<State> => ({ data, loading: false, failed: false })),
          catchError(() => of<Partial<State>>({ loading: false, failed: true })),
          startWith<Partial<State>>({ loading: true, failed: false }),
        ),
      ),
      scan((state: State, change) => ({ ...state, ...change }), { loading: true, failed: false }),
    ),
    { initialValue: { loading: true, failed: false } as State },
  );

  protected readonly syncedText = computed(() => {
    const synced = this.state().data?.syncedAt;
    return synced
      ? new Date(synced).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })
      : '';
  });
}
