import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface DailyUsage {
  date: string;
  documents: number;
  pages: number;
}

export interface UsageAlerts {
  warningPercent: number;
  criticalPercent: number;
}

export interface BillingSummary {
  period: string;
  totalDocuments: number;
  totalPages: number;
  budget: { limit: number; used: number; spent: number; budgetCap: number; costPerPage: number; resetsIn: number };
  alerts: UsageAlerts;
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

  updateBudget(token: string, limit: number): Observable<BillingSummary['budget']> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.put<BillingSummary['budget']>(`${this.apiUrl}/budget`, { limit }, { headers });
  }

  updateAlerts(token: string, alerts: UsageAlerts): Observable<UsageAlerts> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.put<UsageAlerts>(`${this.apiUrl}/alerts`, alerts, { headers });
  }

  exportCsv(token: string): Observable<Blob> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get(`${this.apiUrl}/export`, { headers, responseType: 'blob' });
  }

  getDailyDetail(token: string, date: string, page = 1, limit = 20): Observable<DailyDetail> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const params = new HttpParams().set('date', date).set('page', page).set('limit', limit);
    return this.http.get<DailyDetail>(`${this.apiUrl}/daily`, { headers, params });
  }
}
