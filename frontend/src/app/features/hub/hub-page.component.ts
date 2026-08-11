import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { TranslocoPipe, provideTranslocoScope } from '@jsverse/transloco';
import { ConfigService } from '../../core/services/config.service';
import { LocalePreferencesService } from '../../core/services/locale-preferences.service';
import { AppCardComponent } from './app-card/app-card.component';

@Component({
  selector: 'app-hub-page',
  standalone: true,
  imports: [AppCardComponent, TranslocoPipe],
  providers: [provideTranslocoScope('hub')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = activeLanguage();
    @if (!configService.loaded()) {
      <p class="loading">{{ 'hub.loading' | transloco: {} : lang }}</p>
    } @else {
      <div class="hub-grid">
        @for (app of configService.visibleApps(); track app.id) {
          <app-app-card [app]="app" [defaultIconName]="configService.defaultIcon()" />
        }
      </div>
      @if (configService.visibleApps().length === 0) {
        <p class="empty">{{ 'hub.empty' | transloco: {} : lang }}</p>
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
  readonly activeLanguage = inject(LocalePreferencesService).activeLanguage;

  ngOnInit(): void {
    void this.configService.load();
  }
}
