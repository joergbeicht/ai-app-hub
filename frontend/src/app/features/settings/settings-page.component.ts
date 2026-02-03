import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ConfigService } from '../../core/services/config.service';
import type { AppEntry } from '../../core/models/app-config.model';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [
    RouterLink,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  template: `
    <mat-card class="settings-card">
      <mat-card-header>
        <mat-card-title>Einstellungen</mat-card-title>
        <mat-card-subtitle>Apps bearbeiten. Änderungen werden lokal gespeichert.</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <div class="actions">
          <button mat-raised-button color="primary" (click)="addApp()">
            <mat-icon>add</mat-icon>
            App hinzufügen
          </button>
          <button mat-stroked-button (click)="resetToAsset()">
            <mat-icon>restore</mat-icon>
            Auf Standard zurücksetzen
          </button>
        </div>

        <div class="app-list">
          @for (app of editedApps(); track app.id; let i = $index) {
            <div class="app-row">
              <mat-form-field appearance="outline" class="field-name">
                <mat-label>Name</mat-label>
                <input matInput [(ngModel)]="app.name" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="field-desc">
                <mat-label>Beschreibung</mat-label>
                <input matInput [(ngModel)]="app.description" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="field-url">
                <mat-label>URL</mat-label>
                <input matInput [(ngModel)]="app.url" />
              </mat-form-field>
              <mat-form-field appearance="outline" class="field-icon-type">
                <mat-label>Icon-Typ</mat-label>
                <mat-select [(ngModel)]="app.iconType">
                  <mat-option value="mat-icon">Material Icon</mat-option>
                  <mat-option value="image">Bild (Pfad)</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field appearance="outline" class="field-icon">
                <mat-label>{{ app.iconType === 'mat-icon' ? 'Icon-Name' : 'Bild-Pfad (z. B. app-icons/xyz.svg)' }}</mat-label>
                <input matInput [(ngModel)]="app.icon" />
              </mat-form-field>
              <button mat-icon-button color="warn" (click)="removeApp(i)" aria-label="Entfernen">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          }
        </div>
      </mat-card-content>
      <mat-card-actions>
        <button mat-raised-button color="primary" (click)="save()">
          <mat-icon>save</mat-icon>
          Speichern
        </button>
        <a mat-button routerLink="/">Abbrechen</a>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [
    `
      .settings-card {
        max-width: 800px;
        margin: 0 auto;
      }
      .actions {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1.5rem;
        flex-wrap: wrap;
      }
      .app-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
      }
      .app-row {
        display: grid;
        grid-template-columns: 1fr 1fr auto;
        gap: 0.5rem;
        align-items: start;
        padding: 0.75rem;
        background: var(--bg-tertiary);
        border-radius: 8px;
      }
      .field-name { grid-column: 1; }
      .field-desc { grid-column: 2; }
      .field-url { grid-column: 1 / -1; }
      .field-icon-type { grid-column: 1; }
      .field-icon { grid-column: 2; }
      @media (max-width: 599px) {
        .app-row {
          grid-template-columns: 1fr auto;
        }
        .field-name, .field-desc, .field-url, .field-icon-type, .field-icon {
          grid-column: 1 / -1;
        }
      }
      mat-form-field {
        width: 100%;
      }
    `,
  ],
})
export class SettingsPageComponent implements OnInit {
  private readonly configService = inject(ConfigService);
  private readonly snackBar = inject(MatSnackBar);

  private readonly editedSignal = signal<AppEntry[]>([]);
  readonly editedApps = this.editedSignal.asReadonly();

  ngOnInit(): void {
    void this.configService.load().then(() => {
      const apps = this.configService.apps();
      this.editedSignal.set(apps.map((a) => ({ ...a })));
    });
  }

  addApp(): void {
    const id = `app-${Date.now()}`;
    this.editedSignal.update((list) => [
      ...list,
      {
        id,
        name: 'Neue App',
        description: '',
        url: 'http://localhost:4200',
        iconType: 'mat-icon' as const,
        icon: 'apps',
      },
    ]);
  }

  removeApp(index: number): void {
    this.editedSignal.update((list) => list.filter((_, i) => i !== index));
  }

  save(): void {
    this.configService.saveApps(this.editedSignal());
    this.snackBar.open('Einstellungen gespeichert.', undefined, { duration: 2000 });
  }

  resetToAsset(): void {
    this.configService.resetToAsset();
    void this.configService.load().then(() => {
      this.editedSignal.set(this.configService.apps().map((a) => ({ ...a })));
      this.snackBar.open('Auf Standard zurückgesetzt.', undefined, { duration: 2000 });
    });
  }
}
