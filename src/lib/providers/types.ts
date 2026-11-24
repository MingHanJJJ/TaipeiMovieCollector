/** What every cinema provider adapter returns; the sync layer turns it into DB rows. */
export interface RawScreening {
  providerSessionId?: string;
  providerMovieId?: string;
  /** bare title, without the "(format lang)" prefix */
  movieTitleZh: string;
  movieTitleEn?: string;
  format: string; // '數位' | '4DX 3D' | 'IMAX 3D' …
  language?: string; // '英' | '國' …
  ratingClass?: string;
  runtimeMin?: number;
  startsAt: Date;
}
