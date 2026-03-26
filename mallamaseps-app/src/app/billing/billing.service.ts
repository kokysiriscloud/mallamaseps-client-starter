import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DailyUsage {
  date: string;
  documents: number;
  pages: number;
}

export interface BillingSummary {
  period: string;
  totalDocuments: number;
  totalPages: number;
  budget: { limit: number; used: number; spent: number; budgetCap: number; costPerPage: number; resetsIn: number };
  daily: DailyUsage[];
}

export interface DailyDetailRecord {
  id: number;
  documentId: string | null;
  filename: string | null;
  pages: number;
  createdAt: string;
}

export interface DailyDetail {
  date: string;
  records: DailyDetailRecord[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private http = inject(HttpClient);
  private apiUrl = 'http://localhost:3100/api/billing';

  getSummary(token: string): Observable<BillingSummary> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get<BillingSummary>(this.apiUrl, { headers });
  }

  getDailyDetail(token: string, date: string, page = 1, limit = 20): Observable<DailyDetail> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const params = new HttpParams().set('date', date).set('page', page).set('limit', limit);
    return this.http.get<DailyDetail>(`${this.apiUrl}/daily`, { headers, params });
  }
}
