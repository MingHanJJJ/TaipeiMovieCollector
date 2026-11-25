import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ParamMap } from '@angular/router';
import { Observable } from 'rxjs';
import { ScreeningsResponse } from './models';

@Injectable({ providedIn: 'root' })
export class ScreeningsService {
  private readonly http = inject(HttpClient);

  /** Forwards the page's `date`, `c` and `q` query parameters to the API. */
  get(query: ParamMap): Observable<ScreeningsResponse> {
    const params: Record<string, string> = {};
    for (const key of ['date', 'c', 'q']) {
      const value = query.get(key);
      // An empty `c` is meaningful (no cinema selected), so only skip missing values.
      if (value !== null) params[key] = value;
    }
    return this.http.get<ScreeningsResponse>('/api/screenings', { params });
  }
}
