import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { UsageComponent } from './usage/usage.component';
import { ApiKeysComponent } from './api-keys/api-keys.component';
import { BillingComponent } from './billing/billing.component';

export const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'home', component: HomeComponent },
  { path: 'usage', component: UsageComponent },
  { path: 'api-keys', component: ApiKeysComponent },
  { path: 'billing', component: BillingComponent },
];
