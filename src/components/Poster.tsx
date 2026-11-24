/** Movie poster (2:3). Falls back to a coloured tile with the first character of the title. */
export function Poster({ url, title, className = "" }: { url: string | null; title: string; className?: string }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- TMDB CDN image, no optimisation needed
      <img src={url} alt={`${title} 海報`} loading="lazy" decoding="async" className={`aspect-[2/3] rounded-md bg-neutral-200 object-cover dark:bg-neutral-800 ${className}`} />
    );
  }
  return (
    <div aria-hidden className={`flex aspect-[2/3] items-center justify-center rounded-md bg-gradient-to-br from-neutral-200 to-neutral-300 text-lg font-bold text-neutral-500 dark:from-neutral-800 dark:to-neutral-700 dark:text-neutral-400 ${className}`}>
      {[...title][0]}
    </div>
  );
}
