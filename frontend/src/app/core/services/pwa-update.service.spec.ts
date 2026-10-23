import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { APP_VERSION } from '../app-version';
import { PAGE_RELOAD, PwaUpdateService } from './pwa-update.service';

/** Lets every pending promise chain (fetch -> json -> SwUpdate calls) settle. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve));
}

/** A native `Response` reads its body via streams, which may need more than one task to resolve. */
function versionResponse(version: string): Response {
  return { ok: true, json: () => Promise.resolve({ version }) } as Response;
}

describe('PwaUpdateService', () => {
  let service: PwaUpdateService;
  let fetchSpy: jasmine.Spy;
  let reloadSpy: jasmine.Spy;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let versionUpdates: Subject<VersionReadyEvent>;
  let checkForUpdateSpy: jasmine.Spy;
  let activateUpdateSpy: jasmine.Spy;

  function configure(options: { swEnabled: boolean }): void {
    versionUpdates = new Subject<VersionReadyEvent>();
    checkForUpdateSpy = jasmine.createSpy('checkForUpdate').and.resolveTo(false);
    activateUpdateSpy = jasmine.createSpy('activateUpdate').and.resolveTo(false);
    snackBarSpy = jasmine.createSpyObj<MatSnackBar>('MatSnackBar', ['open']);
    reloadSpy = jasmine.createSpy('reloadPage');

    const swUpdateStub: Partial<SwUpdate> = {
      isEnabled: options.swEnabled,
      versionUpdates: versionUpdates.asObservable(),
      checkForUpdate: checkForUpdateSpy,
      activateUpdate: activateUpdateSpy,
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SwUpdate, useValue: swUpdateStub },
        { provide: MatSnackBar, useValue: snackBarSpy },
        { provide: PAGE_RELOAD, useValue: reloadSpy },
        {
          provide: TranslocoService,
          useValue: { translate: (key: string) => key } as Partial<TranslocoService>,
        },
      ],
    });
    service = TestBed.inject(PwaUpdateService);
  }

  afterEach(() => {
    versionUpdates.complete();
  });

  it('does nothing when version.json matches the running APP_VERSION', async () => {
    configure({ swEnabled: true });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(versionResponse(APP_VERSION));

    service.init();
    await settle();

    expect(fetchSpy).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reloads once an update is already activatable when version.json reports a newer build', async () => {
    configure({ swEnabled: true });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(versionResponse('999.0.0'));
    activateUpdateSpy.and.resolveTo(true);

    service.init();
    await settle();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(snackBarSpy.open).toHaveBeenCalled();
  });

  it('reloads directly when the service worker is disabled but version.json is stale', async () => {
    configure({ swEnabled: false });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(versionResponse('999.0.0'));

    service.init();
    await settle();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads when the service worker reports VERSION_READY', async () => {
    configure({ swEnabled: true });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(versionResponse(APP_VERSION));

    service.init();
    await settle();
    activateUpdateSpy.and.resolveTo(true);

    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });
    await settle();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a missing version.json (e.g. ng serve) without throwing', async () => {
    configure({ swEnabled: false });
    fetchSpy = spyOn(window, 'fetch').and.rejectWith(new Error('network error'));

    expect(() => service.init()).not.toThrow();
    await settle();

    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
