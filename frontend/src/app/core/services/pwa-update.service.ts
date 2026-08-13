import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslocoService } from '@jsverse/transloco';
import { fromEvent } from 'rxjs';
import { filter } from 'rxjs/operators';
import { APP_VERSION } from '../app-version';

const UPDATE_CHECK_INTERVAL_MS = 60_000;
// Grace period after a confirmed new deployment before we force a reload no matter what the
// service worker is doing - covers browsers where VERSION_READY never fires reliably (observed
// on shared tablets; see legacy IoT-Box app for the same workaround).
const FORCE_RELOAD_FALLBACK_MS = 8_000;

interface VersionFile {
  version?: string;
}

/**
 * Registers PWA update checks (production service worker only).
 * Mirrors the ai-service-intelligence pattern, extended with an explicit
 * version.json poll for the shared-tablet PWA (see ADR-12): tablets are
 * rarely closed/reopened, so relying solely on the service worker's own
 * (sometimes delayed) VERSION_READY event left old builds running for days.
 *
 * Two independent detection paths, both funnelling into the same reload:
 * 1) The Angular service worker's own VERSION_READY event / activateUpdate() -
 *    works when the SW's periodic checkForUpdate() behaves as documented.
 * 2) An explicit fetch of `/version.json` (written post-build, see
 *    scripts/write-build-version-json.cjs) with `cache: 'no-store'` - bypasses
 *    the service worker and any HTTP cache entirely, so a new deployment is
 *    detected reliably even after long idle periods / cold starts.
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
          void this.activateAndReload();
        });
    }

    fromEvent(document, 'visibilitychange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (document.visibilityState === 'visible') {
          void this.runChecks();
        }
      });

    const intervalId = window.setInterval(() => {
      void this.runChecks();
    }, UPDATE_CHECK_INTERVAL_MS);

    this.destroyRef.onDestroy(() => window.clearInterval(intervalId));

    void this.runChecks();
  }

  private async runChecks(): Promise<void> {
    await Promise.all([this.checkVersionFile(), this.checkServiceWorker()]);
  }

  /** Bypasses the service worker/HTTP caches entirely - see class doc. */
  private async checkVersionFile(): Promise<void> {
    if (this.updateReloadInProgress) {
      return;
    }
    try {
      const response = await fetch('/version.json', { cache: 'no-store' });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as VersionFile;
      if (data.version && data.version !== APP_VERSION) {
        await this.forceUpdateNow();
      }
    } catch {
      // No version.json in dev (ng serve only runs the postbuild step for `ng build`) or
      // offline - neither is an error worth surfacing to the user.
    }
  }

  private async checkServiceWorker(): Promise<void> {
    if (!this.swUpdate?.isEnabled || this.updateReloadInProgress) {
      return;
    }
    try {
      // Opportunistically activate anything a previous checkForUpdate() already finished
      // downloading, in case VERSION_READY was missed (Windows/iOS SW quirks).
      if (await this.swUpdate.activateUpdate()) {
        this.triggerReload();
        return;
      }
      await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.warn('PwaUpdateService: checkForUpdate failed', error);
    }
  }

  /** A confirmed new deployment (version.json mismatch) - reload no matter what it takes. */
  private async forceUpdateNow(): Promise<void> {
    if (this.updateReloadInProgress) {
      return;
    }

    if (!this.swUpdate?.isEnabled) {
      this.triggerReload();
      return;
    }

    try {
      await this.swUpdate.checkForUpdate();
      if (await this.swUpdate.activateUpdate()) {
        this.triggerReload();
        return;
      }
    } catch (error) {
      console.warn('PwaUpdateService: forceUpdateNow failed', error);
    }

    // Update is still downloading (or activation failed) - VERSION_READY should take over from
    // here, but fall back to a hard reload after a grace period in case it never fires.
    window.setTimeout(() => this.triggerReload(), FORCE_RELOAD_FALLBACK_MS);
  }

  private async activateAndReload(): Promise<void> {
    if (!this.swUpdate?.isEnabled || this.updateReloadInProgress) {
      return;
    }
    try {
      await this.swUpdate.activateUpdate();
      this.triggerReload();
    } catch (error) {
      console.warn('PwaUpdateService: activateUpdate failed', error);
      this.snackBar.open(this.transloco.translate('shell.pwa.updateFailed'), undefined, {
        duration: 8000,
      });
    }
  }

  private triggerReload(): void {
    if (this.updateReloadInProgress) {
      return;
    }
    this.updateReloadInProgress = true;
    this.snackBar.open(this.transloco.translate('shell.pwa.updating'), undefined, {
      duration: 4000,
    });
    document.location.reload();
  }
}
