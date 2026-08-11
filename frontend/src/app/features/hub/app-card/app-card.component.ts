import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  appDisplayDescription,
  appDisplayName,
  type AppEntry,
} from '../../../core/models/app-config.model';
import { LocalePreferencesService } from '../../../core/services/locale-preferences.service';

@Component({
  selector: 'app-app-card',
  standalone: true,
  imports: [MatCardModule, MatIconModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let lang = activeLanguage();
    <mat-card class="app-card" (click)="openUrl()">
      <mat-card-header>
        <div class="card-icon" matCardAvatar>
          @if (app().iconType === 'image' && !showDefaultIcon()) {
            <img [src]="iconSrc()" alt="" (error)="showDefaultIcon.set(true)" />
          }
          @if (app().iconType === 'mat-icon' || showDefaultIcon()) {
            <mat-icon [class.default]="showDefaultIcon()">{{ displayIcon() }}</mat-icon>
          }
        </div>
        <mat-card-title>{{ appDisplayName(app(), lang) }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="description">{{ appDisplayDescription(app(), lang) }}</p>
        <p class="url">{{ app().url }}</p>
      </mat-card-content>
      <mat-card-actions>
        <span class="open-hint">{{ 'hub.card.openHint' | transloco: {} : lang }}</span>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
      .app-card {
        cursor: pointer;
        transition:
          background-color 0.2s,
          box-shadow 0.2s;
        height: 100%;
        display: flex;
        flex-direction: column;
      }
      .app-card:hover {
        background-color: var(--bg-tertiary) !important;
        box-shadow: var(--shadow-md);
      }
      .card-icon {
        width: 48px;
        height: 48px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: var(--bg-tertiary);
        overflow: hidden;
      }
      .card-icon img {
        width: 32px;
        height: 32px;
        object-fit: contain;
      }
      .card-icon mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        color: var(--primary-500);
      }
      .card-icon mat-icon.default {
        color: var(--text-muted);
      }
      .description {
        color: var(--text-secondary);
        font-size: 0.875rem;
        margin: 0.5rem 0;
        line-height: 1.4;
      }
      .url {
        color: var(--text-muted);
        font-size: 0.75rem;
        word-break: break-all;
        margin: 0;
      }
      .open-hint {
        font-size: 0.75rem;
        color: var(--primary-500);
      }
      mat-card-header {
        align-items: flex-start;
      }
      mat-card-title {
        margin-left: 0.5rem;
      }
    `,
  ],
})
export class AppCardComponent {
  readonly app = input.required<AppEntry>();
  readonly defaultIconName = input<string>('apps');
  readonly activeLanguage = inject(LocalePreferencesService).activeLanguage;
  readonly appDisplayName = appDisplayName;
  readonly appDisplayDescription = appDisplayDescription;

  readonly showDefaultIcon = signal(false);

  iconSrc(): string {
    const a = this.app();
    if (a.iconType !== 'image') return '';
    return a.icon.startsWith('http') ? a.icon : `assets/${a.icon}`;
  }

  displayIcon(): string {
    if (this.showDefaultIcon()) return this.defaultIconName();
    const a = this.app();
    if (a.iconType === 'mat-icon') return a.icon || this.defaultIconName();
    return this.defaultIconName();
  }

  openUrl(): void {
    const url = this.app().url;
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  }
}
