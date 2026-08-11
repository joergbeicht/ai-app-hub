import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslocoService } from '@jsverse/transloco';
import { fromEvent } from 'rxjs';
import { filter } from 'rxjs/operators';

const UPDATE_CHECK_INTERVAL_MS = 60_000;

/**
 * Registers PWA update checks (production service worker only).
 * Mirrors the ai-service-intelligence pattern, without a backend /api/version
 * fallback (this hub has no NestJS backend in the MVP).
 */
@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  private readonly swUpdate: SwUpdate | null = inject(SwUpdate, { optional: true });
  private readonly snackBar = inject(MatSnackBar);
  private readonly transloco = inject(TranslocoService);
  private readonly destroyRef = inject(DestroyRef);

  private updateReloadInProgress = false;

  init(): void {
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(
          filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
          takeUntilDestroyed(this.destroyRef),
        )
        .subscribe(() => {
          void this.reloadToLatestVersion();
        });
    }

    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (document.visibilityState === 'visible') {
          void this.checkForUpdate();
        }
      });

    const intervalId = window.setInterval(() => {
      void this.checkForUpdate();
    }, UPDATE_CHECK_INTERVAL_MS);

    this.destroyRef.onDestroy(() => window.clearInterval(intervalId));

    void this.checkForUpdate();
  }

  private async checkForUpdate(): Promise<void> {
    if (!this.swUpdate?.isEnabled) {
      return;
    }
    try {
      await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.warn('PwaUpdateService: checkForUpdate failed', error);
    }
  }

  private async reloadToLatestVersion(): Promise<void> {
    if (!this.swUpdate?.isEnabled || this.updateReloadInProgress) {
      return;
    }

    this.updateReloadInProgress = true;
    this.snackBar.open(this.transloco.translate('shell.pwa.updating'), undefined, {
      duration: 4000,
    });

    try {
      await this.swUpdate.activateUpdate();
      document.location.reload();
    } catch (error) {
      console.warn('PwaUpdateService: activateUpdate failed', error);
      this.updateReloadInProgress = false;
      this.snackBar.open(this.transloco.translate('shell.pwa.updateFailed'), undefined, {
        duration: 8000,
      });
    }
  }
}
