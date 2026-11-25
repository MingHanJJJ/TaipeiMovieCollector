import { Component, computed, input } from '@angular/core';

/** Movie poster (2:3). Falls back to a coloured tile with the first character of the title. */
@Component({
  selector: 'app-poster',
  template: `
    @if (url(); as src) {
      <img
        [src]="src"
        [alt]="title() + ' 海報'"
        loading="lazy"
        decoding="async"
        class="aspect-[2/3] w-full rounded-md bg-neutral-200 object-cover dark:bg-neutral-800"
      />
    } @else {
      <div
        aria-hidden="true"
        class="flex aspect-[2/3] items-center justify-center rounded-md bg-gradient-to-br from-neutral-200 to-neutral-300 text-lg font-bold text-neutral-500 dark:from-neutral-800 dark:to-neutral-700 dark:text-neutral-400"
      >
        {{ initial() }}
      </div>
    }
  `,
  host: { class: 'block' },
})
export class Poster {
  readonly url = input.required<string | null>();
  readonly title = input.required<string>();
  protected readonly initial = computed(() => [...this.title()][0]);
}
