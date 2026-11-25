import { Component, computed, input } from '@angular/core';
import { Axis, MovieGroup } from '../../core/models';
import { Poster } from '../poster/poster';
import { TimelineMatrix } from '../timeline-matrix/timeline-matrix';

@Component({
  selector: 'app-movie-card',
  imports: [Poster, TimelineMatrix],
  templateUrl: './movie-card.html',
  host: { class: 'block' },
})
export class MovieCard {
  readonly group = input.required<MovieGroup>();
  readonly axis = input.required<Axis>();
  readonly nowMin = input.required<number | null>();

  /** Rating class and running time, leaving out unknown values. */
  protected readonly meta = computed(() => {
    const { ratingClass, runtimeMin } = this.group();
    const runtime = runtimeMin
      ? `${Math.floor(runtimeMin / 60)}h${String(runtimeMin % 60).padStart(2, '0')}m`
      : null;
    return [ratingClass, runtime].filter((m): m is string => !!m);
  });
}
