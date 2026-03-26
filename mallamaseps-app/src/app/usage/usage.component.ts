import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BillingService, BillingSummary, DailyUsage, DailyDetail, UsageAlerts } from '../billing/billing.service';
import { SessionService } from '../session.service';

@Component({
  selector: 'app-usage',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usage.component.html',
})
export class UsageComponent implements OnInit {
  private billingService = inject(BillingService);
  private token = inject(SessionService).session?.token ?? '';

  data: BillingSummary | null = null;
  loading = true;
  error: string | null = null;
  chartMax = 0;

  budgetEditing = false;
  budgetSaving = false;
  budgetDraft: number | null = null;

  alertsEditing = false;
  alertsSaving = false;
  alertsDraft: UsageAlerts | null = null;

  // Daily detail drill-down
  selectedDay: DailyUsage | null = null;
  detail: DailyDetail | null = null;
  detailLoading = false;
  readonly detailLimit = 20;

  ngOnInit(): void {
    this.billingService.getSummary(this.token).subscribe({
      next: (d) => {
        const alerts = d.alerts ?? { warningPercent: 80, criticalPercent: 100 };
        this.data = { ...d, alerts };
        this.chartMax = Math.max(1, ...d.daily.map((r) => r.pages));
        this.loading = false;
      },
      error: () => {
        this.error = 'No se pudo cargar la información de consumo.';
        this.loading = false;
      },
    });
  }

  startBudgetEdit(): void {
    if (!this.data) return;
    this.budgetDraft = this.data.budget.limit;
    this.budgetEditing = true;
  }

  cancelBudgetEdit(): void {
    this.budgetEditing = false;
    this.budgetDraft = null;
  }

  saveBudget(): void {
    if (!this.data || this.budgetDraft === null) return;
    const limit = Math.max(1, Number(this.budgetDraft));
    this.budgetSaving = true;
    this.billingService.updateBudget(this.token, limit).subscribe({
      next: (budget) => {
        this.data = { ...this.data!, budget };
        this.budgetEditing = false;
        this.budgetSaving = false;
        this.budgetDraft = null;
      },
      error: () => {
        this.error = 'No se pudo actualizar el budget.';
        this.budgetSaving = false;
      },
    });
  }

  startAlertsEdit(): void {
    if (!this.data) return;
    this.alertsDraft = { ...this.data.alerts };
    this.alertsEditing = true;
  }

  cancelAlertsEdit(): void {
    this.alertsEditing = false;
    this.alertsDraft = null;
  }

  saveAlerts(): void {
    if (!this.data || !this.alertsDraft) return;
    const warning = Math.max(1, Math.min(100, Number(this.alertsDraft.warningPercent)));
    const critical = Math.max(warning, Math.min(100, Number(this.alertsDraft.criticalPercent)));
    const payload = { warningPercent: warning, criticalPercent: critical };
    this.alertsSaving = true;
    this.billingService.updateAlerts(this.token, payload).subscribe({
      next: (alerts) => {
        this.data = { ...this.data!, alerts };
        this.alertsEditing = false;
        this.alertsSaving = false;
        this.alertsDraft = null;
      },
      error: () => {
        this.error = 'No se pudieron actualizar las alertas.';
        this.alertsSaving = false;
      },
    });
  }

  exportCsv(): void {
    this.billingService.exportCsv(this.token).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const now = new Date();
        const month = now.toLocaleString('en-US', { month: 'short', year: 'numeric' }).replace(' ', '-');
        a.download = `usage-${month}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.error = 'No se pudo exportar el CSV.';
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
    if (!limit) return 0;
    return Math.min(100, (used / limit) * 100);
  }

  budgetBarColor(): string {
    const pct = this.budgetPercent();
    if (pct >= 100) return 'bg-red-500';
    if (pct >= 80) return 'bg-amber-500';
    return 'bg-violet-600';
  }

  alertStatusLabel(threshold: number): string {
    return this.budgetPercent() >= threshold ? 'Triggered' : 'Pending';
  }

  alertStatusClass(threshold: number): string {
    if (this.budgetPercent() < threshold) return 'text-slate-600';
    return threshold >= 100 ? 'text-red-400' : 'text-amber-400';
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
