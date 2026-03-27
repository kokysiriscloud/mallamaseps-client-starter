import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  BillingLiquidationItem,
  BillingLiquidationPreview,
  BillingRate,
  BillingService,
} from './billing.service';
import { SessionService } from '../session.service';

type BillingTab = 'overview' | 'history' | 'preferences';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './billing.component.html',
})
export class BillingComponent implements OnInit {
  private billingService = inject(BillingService);
  private sessionService = inject(SessionService);

  activeTab: BillingTab = 'overview';
  loading = false;
  error: string | null = null;

  cutoffDate = new Date().toISOString().slice(0, 10);
  preview: BillingLiquidationPreview | null = null;
  liquidations: BillingLiquidationItem[] = [];

  rate: BillingRate = {
    tier1LimitPages: 1_000_000,
    tier1Rate: 80,
    tier2Rate: 60,
    effectiveFrom: new Date().toISOString(),
  };

  ngOnInit(): void {
    this.loadRate();
    this.loadLiquidations();
  }

  private get token(): string {
    return this.sessionService.session?.token ?? '';
  }

  selectTab(tab: BillingTab): void {
    this.activeTab = tab;
  }

  loadRate(): void {
    this.billingService.getRate(this.token).subscribe({
      next: (rate) => {
        this.rate = rate;
      },
      error: () => {
        this.error = 'No se pudo cargar la tarifa.';
      },
    });
  }

  saveRate(): void {
    this.billingService
      .updateRate(this.token, {
        tier1LimitPages: Number(this.rate.tier1LimitPages || 1_000_000),
        tier1Rate: Number(this.rate.tier1Rate || 80),
        tier2Rate: Number(this.rate.tier2Rate || 60),
      })
      .subscribe({
        next: (rate) => {
          this.rate = rate;
          this.error = null;
        },
        error: () => {
          this.error = 'No se pudo guardar la tarifa.';
        },
      });
  }

  runPreview(): void {
    this.loading = true;
    this.billingService.previewLiquidation(this.token, this.cutoffDate).subscribe({
      next: (preview) => {
        this.preview = preview;
        this.loading = false;
        this.error = null;
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'No se pudo generar preview.';
      },
    });
  }

  liquidate(): void {
    this.loading = true;
    this.billingService.createLiquidation(this.token, this.cutoffDate).subscribe({
      next: () => {
        this.loading = false;
        this.error = null;
        this.runPreview();
        this.loadLiquidations();
        this.activeTab = 'history';
      },
      error: (err) => {
        this.loading = false;
        this.error = err?.error?.message || 'No se pudo liquidar.';
      },
    });
  }

  exportPreviewLog(): void {
    this.billingService.exportPreviewCsv(this.token, this.cutoffDate).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `billing-preview-${this.cutoffDate}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.error = 'No se pudo exportar el log del preview.';
      },
    });
  }

  loadLiquidations(): void {
    this.billingService.listLiquidations(this.token).subscribe({
      next: (rows) => {
        this.liquidations = rows || [];
      },
      error: () => {
        this.error = 'No se pudo cargar historial de liquidaciones.';
      },
    });
  }

  markPay(row: BillingLiquidationItem): void {
    this.billingService.markLiquidationPay(this.token, row.id).subscribe({
      next: () => {
        this.loadLiquidations();
      },
      error: () => {
        this.error = `No se pudo marcar pago para liquidación ${row.id}.`;
      },
    });
  }

  exportLiquidation(row: BillingLiquidationItem): void {
    this.billingService.exportLiquidationCsv(this.token, row.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `billing-liquidation-${row.id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => {
        this.error = `No se pudo exportar liquidación ${row.id}.`;
      },
    });
  }

  statusLabel(s: string): string {
    if (s === 'pay') return 'Pagado';
    return 'Pendiente';
  }

  statusClass(s: string): string {
    if (s === 'pay') return 'bg-emerald-900 text-emerald-300';
    return 'bg-amber-900 text-amber-300';
  }
}
