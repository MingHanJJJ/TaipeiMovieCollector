import { Component, computed, input } from '@angular/core';
import { KIND_CLASS } from '../../core/formats';
import { Axis, Block, CinemaRow, MovieGroup } from '../../core/models';

const PX_PER_HOUR = 60;
const LANE_H = 30;
const LABEL_W = 92;

const clock = (min: number) => {
  const m = min % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/** Turns the API data into pixel positions; the template only draws them. */
@Component({
  selector: 'app-timeline-matrix',
  templateUrl: './timeline-matrix.html',
  host: { class: 'block' },
})
export class TimelineMatrix {
  readonly group = input.required<MovieGroup>();
  readonly axis = input.required<Axis>();
  readonly nowMin = input.required<number | null>();

  protected readonly labelWidth = LABEL_W;
  protected readonly width = computed(() => this.px(this.axis().endMin));

  protected readonly hours = computed(() => {
    const { startMin, endMin } = this.axis();
    return Array.from({ length: (endMin - startMin) / 60 + 1 }, (_, i) => {
      const min = startMin + i * 60;
      return { min, left: this.px(min), label: clock(min).slice(0, 2), nextDay: min >= 1440 };
    });
  });

  protected readonly nowLeft = computed(() => {
    const now = this.nowMin();
    const { startMin, endMin } = this.axis();
    return now !== null && now >= startMin && now <= endMin ? this.px(now) : null;
  });

  protected readonly rows = computed(() =>
    this.group().rows.map((row) => ({
      code: row.cinemaCode,
      name: row.cinemaShort,
      height: row.lanes * LANE_H + 8,
      blocks: row.blocks.map((block) => this.layout(row, block)),
    })),
  );

  /** Horizontal position of a time on the shared axis. */
  private px(min: number): number {
    return ((min - this.axis().startMin) / 60) * PX_PER_HOUR;
  }

  private layout(row: CinemaRow, block: Block) {
    const now = this.nowMin();
    const past = now !== null && block.startMin < now;
    const language = block.language ? ` · ${block.language}` : '';
    return {
      ...block,
      left: this.px(block.startMin),
      width: Math.max(((block.endMin - block.startMin) / 60) * PX_PER_HOUR - 2, 46),
      top: 4 + block.lane * LANE_H,
      height: LANE_H - 4,
      title: `${row.cinemaShort} ${block.time}–${clock(block.endMin)}\n${block.format}${language}`,
      classes: `${KIND_CLASS[block.kind]}${past ? ' opacity-40' : ''}`,
    };
  }
}
