import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, MatToolbarModule, MatButtonModule, MatIconModule],
  template: `
    <div class="app-shell">
      <mat-toolbar class="header-toolbar">
        <img class="toolbar-app-icon" src="favicon.svg" alt="" />
        <span class="toolbar-title">Axora - AI App Hub</span>
        <span class="spacer"></span>
        <a mat-icon-button routerLink="/" aria-label="Startseite">
          <mat-icon>apps</mat-icon>
        </a>
        <a mat-icon-button routerLink="/settings" aria-label="Einstellungen">
          <mat-icon>settings</mat-icon>
        </a>
      </mat-toolbar>
      <main class="main-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [
    `
      .app-shell {
        display: flex;
        flex-direction: column;
        min-height: 100vh;
        background-color: var(--bg-primary);
        color: var(--text-primary);
      }
      .header-toolbar {
        flex-shrink: 0;
        background-color: var(--bg-secondary) !important;
        color: var(--text-primary) !important;
        border-bottom: 1px solid var(--border-primary);
        min-height: 56px;
      }
      .toolbar-app-icon {
        height: 32px;
        width: 32px;
        margin-right: 0.75rem;
        flex-shrink: 0;
      }
      .toolbar-title {
        font-size: 1.25rem;
        font-weight: 500;
      }
      .spacer {
        flex: 1 1 auto;
      }
      .main-content {
        flex: 1;
        padding: 1rem;
        max-width: 100%;
      }
      @media (min-width: 600px) {
        .main-content {
          padding: 1.5rem;
        }
      }
    `,
  ],
})
export class AppComponent {}
