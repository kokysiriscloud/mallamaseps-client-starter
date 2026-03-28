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

export type BillingStatusFilter = 'all' | 'unbilled' | 'pending_pay' | 'pay';

export interface BillingStatusSummary {
  status: BillingStatusFilter;
  label: string;
  documents: number;
  pages: number;
  amount: number;
}

export interface BillingSummary {
  period: string;
  selectedStatus: BillingStatusFilter;
  totalDocuments: number;
  totalPages: number;
  totalAmount: number;
  statusSummary: BillingStatusSummary[];
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

export interface BillingRate {
  tier1LimitPages: number;
  tier1Rate: number;
  tier2Rate: number;
  effectiveFrom: string;
}

export interface BillingLiquidationPreview {
  cutoffDate: string;
  totalDocuments: number;
  totalPages: number;
  tier1Pages: number;
  tier1Rate: number;
  tier1Amount: number;
  tier2Pages: number;
  tier2Rate: number;
  tier2Amount: number;
  totalAmount: number;
}

export interface BillingLiquidationItem {
  id: number;
  cutoffDate: string;
  totalDocuments: number;
  totalPages: number;
  totalAmount: number;
  status: 'pending_pay' | 'pay';
  createdBy: string;
  createdAt: string;
  paidAt: string | null;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  private http = inject(HttpClient);
  private apiUrl = 'https://api-mallamaseps.siriscloud.com.co/api/billing';

  getSummary(token: string, billingStatus: BillingStatusFilter = 'unbilled'): Observable<BillingSummary> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const params = new HttpParams().set('billingStatus', billingStatus);
    return this.http.get<BillingSummary>(this.apiUrl, { headers, params });
  }

  updateBudget(token: string, limit: number): Observable<BillingSummary['budget']> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.put<BillingSummary['budget']>(`${this.apiUrl}/budget`, { limit }, { headers });
  }

  updateAlerts(token: string, alerts: UsageAlerts): Observable<UsageAlerts> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.put<UsageAlerts>(`${this.apiUrl}/alerts`, alerts, { headers });
  }

  exportCsv(token: string, billingStatus: BillingStatusFilter = 'unbilled'): Observable<Blob> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const params = new HttpParams().set('billingStatus', billingStatus);
    return this.http.get(`${this.apiUrl}/export`, { headers, params, responseType: 'blob' });
  }

  getDailyDetail(token: string, date: string, page = 1, limit = 20): Observable<DailyDetail> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    const params = new HttpParams().set('date', date).set('page', page).set('limit', limit);
    return this.http.get<DailyDetail>(`${this.apiUrl}/daily`, { headers, params });
  }

  getRate(token: string): Observable<BillingRate> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get<BillingRate>(`${this.apiUrl}/rate`, { headers });
  }

  updateRate(token: string, payload: { tier1LimitPages: number; tier1Rate: number; tier2Rate: number }): Observable<BillingRate> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.put<BillingRate>(`${this.apiUrl}/rate`, payload, { headers });
  }

  previewLiquidation(token: string, cutoffDate: string): Observable<BillingLiquidationPreview> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post<BillingLiquidationPreview>(`${this.apiUrl}/liquidations/preview`, { cutoffDate }, { headers });
  }

  exportPreviewCsv(token: string, cutoffDate: string): Observable<Blob> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post(`${this.apiUrl}/liquidations/preview/export`, { cutoffDate }, { headers, responseType: 'blob' });
  }

  createLiquidation(token: string, cutoffDate: string): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.post<any>(`${this.apiUrl}/liquidations`, { cutoffDate }, { headers });
  }

  listLiquidations(token: string): Observable<BillingLiquidationItem[]> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get<BillingLiquidationItem[]>(`${this.apiUrl}/liquidations`, { headers });
  }

  markLiquidationPay(token: string, id: number): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.patch<any>(`${this.apiUrl}/liquidations/${id}/pay`, {}, { headers });
  }

  exportLiquidationCsv(token: string, id: number): Observable<Blob> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
    return this.http.get(`${this.apiUrl}/liquidations/${id}/export`, { headers, responseType: 'blob' });
  }
}
