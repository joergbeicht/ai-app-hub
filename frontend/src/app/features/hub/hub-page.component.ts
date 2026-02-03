import { Component, OnInit, inject } from '@angular/core';
import { ConfigService } from '../../core/services/config.service';
import { AppCardComponent } from './app-card/app-card.component';

@Component({
  selector: 'app-hub-page',
  standalone: true,
  imports: [AppCardComponent],
  template: `
    @if (!configService.loaded()) {
      <p class="loading">Lade Konfiguration…</p>
    } @else {
      <div class="hub-grid">
        @for (app of configService.apps(); track app.id) {
          <app-app-card
            [app]="app"
            [defaultIconName]="configService.defaultIcon()"
          />
        }
      </div>
      @if (configService.apps().length === 0) {
        <p class="empty">Keine Apps konfiguriert. In den Einstellungen hinzufügen.</p>
      }
    }
  `,
  styles: [
    `
      .loading,
      .empty {
        color: var(--text-secondary);
        text-align: center;
        padding: 2rem;
      }
      .hub-grid {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1fr;
      }
      @media (min-width: 600px) {
        .hub-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      @media (min-width: 960px) {
        .hub-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
    `,
  ],
})
export class HubPageComponent implements OnInit {
  readonly configService = inject(ConfigService);

  ngOnInit(): void {
    void this.configService.load();
  }
}
