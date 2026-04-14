import { CommonModule } from '@angular/common';
import { Component, computed, input, signal, ViewEncapsulation } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { Color, LegendPosition, NgxChartsModule, ScaleType } from '@swimlane/ngx-charts';
import { Receipt } from '../../models/receipt.model';

@Component({
  selector: 'app-dashboard-charts',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonToggleModule,
    NgxChartsModule,
  ],
  template: `
    <div class="charts-section" *ngIf="receipts().length > 0">
      <!-- Pie Chart -->
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Ausgaben nach Kategorie</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="chart-wrapper">
            <ngx-charts-pie-chart
              [scheme]="colorScheme"
              [results]="spendingByCategory()"
              [gradient]="false"
              [legend]="true"
              [legendTitle]="'Kategorien'"
              [legendPosition]="legendPosition"
              [labels]="true"
              [trimLabels]="false"
              [doughnut]="true"
              [arcWidth]="0.30"
              [explodeSlices]="false"
            >
              <ng-template #tooltipTemplate let-model="model">
                <div class="custom-tooltip">
                  <span>{{ model.name }}</span>
                  <br />
                  <strong>{{ model.value | currency : 'EUR' }}</strong>
                </div>
              </ng-template>
            </ngx-charts-pie-chart>
          </div>
        </mat-card-content>
      </mat-card>

      <!-- Line Chart -->
      <mat-card class="chart-card">
        <mat-card-header class="chart-header-with-controls">
          <mat-card-title>Ausgabenverlauf</mat-card-title>
          <mat-button-toggle-group
            [ngModel]="timeResolution()"
            (ngModelChange)="timeResolution.set($event)"
            appearance="legacy"
            name="timeResolution"
            aria-label="Zeitraum"
          >
            <mat-button-toggle value="day">Tag</mat-button-toggle>
            <mat-button-toggle value="week">Woche</mat-button-toggle>
            <mat-button-toggle value="month">Monat</mat-button-toggle>
          </mat-button-toggle-group>
        </mat-card-header>
        <mat-card-content>
          <div class="chart-wrapper">
            <ngx-charts-line-chart
              [scheme]="colorScheme"
              [results]="spendingOverTime()"
              [gradient]="true"
              [xAxis]="true"
              [yAxis]="true"
              [legend]="false"
              [showXAxisLabel]="true"
              [showYAxisLabel]="true"
              xAxisLabel="Zeitraum"
              yAxisLabel="Ausgaben (€)"
              [yAxisTickFormatting]="yAxisTickFormatting"
              [xAxisTickFormatting]="xAxisTickFormatting"
              [autoScale]="true"
              [timeline]="true"
            >
              <ng-template #tooltipTemplate let-model="model">
                <div class="custom-tooltip">
                  <span>{{ model.name | date : 'mediumDate' }}</span>
                  <span *ngIf="model.extra?.store"> - {{ model.extra.store }}</span>
                  <br />
                  <strong>{{ model.value | currency : 'EUR' }}</strong>
                </div>
              </ng-template>
            </ngx-charts-line-chart>
          </div>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .charts-section {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
        gap: 16px;
        padding: 0 2% 20px;
        max-width: 100%;
      }

      .chart-card {
        height: 500px;
        display: flex;
        flex-direction: column;
      }

      .chart-header-with-controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding-right: 16px;
      }

      .chart-wrapper {
        height: 420px;
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
      }

      @media (max-width: 768px) {
        .charts-section {
          padding: 0 12px 16px;
        }
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
})
export class DashboardChartsComponent {
  // Inputs
  receipts = input.required<Receipt[]>();

  // Chart Options
  legendPosition = LegendPosition.Right;
  colorScheme: Color = {
    name: 'bon-chance',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#5AA454', '#A10A28', '#C7B42C', '#AAAAAA', '#3f51b5', '#ff4081'],
  };

  // Time Resolution State
  timeResolution = signal<'day' | 'week' | 'month'>('day'); // Using signal directly in component

  // Pie Chart: Spending by Category
  protected spendingByCategory = computed(() => {
    const receipts = this.receipts();
    const categoryMap = new Map<string, number>();
    let totalSum = 0;

    // 1. Aggregate data
    receipts.forEach((receipt) => {
      if (receipt.items && receipt.items.length > 0) {
        receipt.items.forEach((item) => {
          const category = item.categoryId || 'Unkategorisiert';
          const amount = item.price * item.quantity;
          categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
          totalSum += amount;
        });
      } else {
        const category = receipt.store?.name || 'Unbekannt';
        const amount = receipt.totalAmount;
        categoryMap.set(category, (categoryMap.get(category) || 0) + amount);
        totalSum += amount;
      }
    });

    // 2. Convert to array and sort
    let results = Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // 3. Group small slices (< 3%) into "Sonstiges"
    const threshold = totalSum * 0.03;
    const mainCategories = [];
    let otherSum = 0;

    for (const item of results) {
      if (item.value >= threshold) {
        mainCategories.push(item);
      } else {
        otherSum += item.value;
      }
    }

    if (otherSum > 0) {
      const existingOther = mainCategories.find((c) => c.name === 'Sonstiges');
      if (existingOther) {
        existingOther.value += otherSum;
      } else {
        mainCategories.push({ name: 'Sonstiges', value: otherSum });
      }
    }

    return mainCategories.sort((a, b) => b.value - a.value);
  });

  // Line Chart: Spending over Time
  protected spendingOverTime = computed(() => {
    const receipts = this.receipts();
    const resolution = this.timeResolution();

    const sortedReceipts = [...receipts].sort(
      (a, b) => new Date(a.purchaseDate).getTime() - new Date(b.purchaseDate).getTime()
    );

    if (resolution === 'day') {
      const series = sortedReceipts.map((r) => ({
        name: new Date(r.purchaseDate),
        value: r.totalAmount,
        extra: { store: r.store?.name || 'Unbekannt' },
      }));
      return [{ name: 'Ausgaben', series }];
    }

    const dateMap = new Map<number, number>();

    sortedReceipts.forEach((receipt) => {
      const dateObj = new Date(receipt.purchaseDate);
      let keyDate: Date;

      if (resolution === 'week') {
        const d = new Date(dateObj);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        keyDate = new Date(d.setDate(diff));
        keyDate.setHours(0, 0, 0, 0);
      } else {
        keyDate = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
      }

      const key = keyDate.getTime();
      dateMap.set(key, (dateMap.get(key) || 0) + receipt.totalAmount);
    });

    const series = Array.from(dateMap.entries())
      .map(([ts, value]) => ({
        name: new Date(ts),
        value,
      }))
      .sort((a, b) => a.name.getTime() - b.name.getTime());

    return [{ name: 'Ausgaben', series }];
  });

  yAxisTickFormatting(val: number): string {
    return `€${val}`;
  }

  xAxisTickFormatting(val: any): string {
    if (val instanceof Date) {
      return val.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    }
    return val;
  }
}
