import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BillingService } from './billing.service';
import { SessionService } from '../session.service';

type BillingTab = 'overview' | 'history' | 'preferences';

interface CreditBalance {
  balance: number;
  currency: string;
}

interface InvoiceSummary {
  id: string;
  date: string;
  period: string;
  amount: number;
  status: 'paid' | 'pending' | 'overdue';
}

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './billing.component.html',
})
export class BillingComponent {
  private token = inject(SessionService).session?.token ?? '';
  private billingService = inject(BillingService);

  activeTab: BillingTab = 'overview';
  loading = false;

  // Credit balance (mock — will come from a real billing API)
  credit: CreditBalance = {
    balance: 2_450_000,
    currency: 'COP',
  };

  // Pricing tiers
  pricingTiers = [
    { range: '0 – 1,000,000 págs', price: 80, currency: 'COP' },
    { range: '1,000,000+ págs', price: 60, currency: 'COP' },
  ];

  // Recent invoices (mock)
  invoices: InvoiceSummary[] = [
    { id: 'INV-2026-03', date: '2026-03-01', period: 'Febrero 2026', amount: 11_200_000, status: 'pending' },
    { id: 'INV-2026-02', date: '2026-02-01', period: 'Enero 2026', amount: 9_840_000, status: 'paid' },
    { id: 'INV-2026-01', date: '2026-01-01', period: 'Diciembre 2025', amount: 10_560_000, status: 'paid' },
  ];

  selectTab(tab: BillingTab): void {
    this.activeTab = tab;
  }

  statusLabel(s: string): string {
    if (s === 'paid') return 'Pagada';
    if (s === 'pending') return 'Pendiente';
    return 'Vencida';
  }

  statusClass(s: string): string {
    if (s === 'paid') return 'bg-emerald-900 text-emerald-300';
    if (s === 'pending') return 'bg-amber-900 text-amber-300';
    return 'bg-red-900 text-red-300';
  }
}
