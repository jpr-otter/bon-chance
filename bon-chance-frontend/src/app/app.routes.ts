import { Routes } from '@angular/router';
import { authGuard, loginGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./components/auth/login.component').then((c) => c.LoginComponent),
    canActivate: [loginGuard],
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./components/auth/register.component').then((c) => c.RegisterComponent),
    canActivate: [loginGuard],
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./components/dashboard/dashboard.component').then((c) => c.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    loadComponent: () =>
      import('./components/admin/admin-dashboard.component').then((c) => c.AdminDashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'receipts',
    loadComponent: () =>
      import('./components/receipt-manager/receipt-manager.component').then(
        (c) => c.ReceiptManagerComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'statistics',
    loadComponent: () =>
      import('./components/statistics/statistics.component').then((c) => c.StatisticsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'budget',
    loadComponent: () =>
      import('./components/budget/budget.component').then((c) => c.BudgetComponent),
    canActivate: [authGuard],
  },
  {
    path: '**',
    redirectTo: '/dashboard',
  },
];
