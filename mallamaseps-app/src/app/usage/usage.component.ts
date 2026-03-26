import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BillingService, BillingSummary, DailyUsage, DailyDetail } from '../billing/billing.service';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './usage.component.html',
})
export class UsageComponent implements OnInit {
  private billingService = inject(BillingService);
  private token = inject(SessionService).session?.token ?? '';

  data: BillingSummary | null = null;
  loading = true;
  error: string | null = null;
  chartMax = 0;

  // Daily detail drill-down
  selectedDay: DailyUsage | null = null;
  detail: DailyDetail | null = null;
  detailLoading = false;
  readonly detailLimit = 20;

  ngOnInit(): void {
    this.billingService.getSummary(this.token).subscribe({
      next: (d) => {
        this.data = d;
        this.chartMax = Math.max(1, ...d.daily.map((r) => r.pages));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la información de consumo.';
        this.loading = false;
      },
    });
  }

  selectDay(day: DailyUsage): void {
    if (day.documents === 0) return;
    if (this.selectedDay?.date === day.date) {
      this.selectedDay = null;
      this.detail = null;
      return;
    }
    this.selectedDay = day;
    this.loadDetail(day.date, 1);
  }

  loadDetail(date: string, page: number): void {
    this.detailLoading = true;
    this.billingService.getDailyDetail(this.token, date, page, this.detailLimit).subscribe({
      next: (d) => {
        this.detail = d;
        this.detailLoading = false;
      },
      error: () => {
        this.detail = null;
        this.detailLoading = false;
      },
    });
  }

  closeDetail(): void {
    this.selectedDay = null;
    this.detail = null;
  }

  barHeight(day: DailyUsage): number {
    if (!this.chartMax) return 0;
    return Math.max(1, (day.pages / this.chartMax) * 100);
  }

  isSelected(day: DailyUsage): boolean {
    return this.selectedDay?.date === day.date;
  }

  budgetPercent(): number {
    if (!this.data) return 0;
    const { used, limit } = this.data.budget;
    return Math.min(100, (used / limit) * 100);
  }

  budgetBarColor(): string {
    const pct = this.budgetPercent();
    if (pct >= 100) return 'bg-red-500';
    if (pct >= 80) return 'bg-amber-500';
    return 'bg-violet-600';
  }

  midDay(): DailyUsage | null {
    if (!this.data || this.data.daily.length < 16) return null;
    return this.data.daily[Math.floor(this.data.daily.length / 2)];
  }

  dayLabel(day: DailyUsage): string {
    const d = new Date(day.date + 'T00:00:00');
    return d.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
  }

  dayLabelLong(day: DailyUsage): string {
    const d = new Date(day.date + 'T00:00:00');
    return d.toLocaleDateString('es-CO', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  detailEndRecord(): number {
    if (!this.detail) return 0;
    const { page, limit, total } = this.detail.pagination;
    return Math.min(page * limit, total);
  }
}
