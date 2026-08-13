import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { TranslocoService } from '@jsverse/transloco';
import { Subject } from 'rxjs';
import { APP_VERSION } from '../app-version';
import { PwaUpdateService } from './pwa-update.service';

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
        {
          provide: TranslocoService,
          useValue: { translate: (key: string) => key } as Partial<TranslocoService>,
        },
      ],
    });
    service = TestBed.inject(PwaUpdateService);
  }

  beforeEach(() => {
    reloadSpy = spyOn(document.location, 'reload').and.stub();
  });

  afterEach(() => {
    versionUpdates.complete();
  });

  it('does nothing when version.json matches the running APP_VERSION', async () => {
    configure({ swEnabled: true });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(
      new Response(JSON.stringify({ version: APP_VERSION }), { status: 200 }),
    );

    service.init();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(fetchSpy).toHaveBeenCalledWith('/version.json', { cache: 'no-store' });
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('reloads once an update is already activatable when version.json reports a newer build', async () => {
    configure({ swEnabled: true });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(
      new Response(JSON.stringify({ version: '999.0.0' }), { status: 200 }),
    );
    activateUpdateSpy.and.resolveTo(true);

    service.init();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(snackBarSpy.open).toHaveBeenCalled();
  });

  it('reloads directly when the service worker is disabled but version.json is stale', async () => {
    configure({ swEnabled: false });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(
      new Response(JSON.stringify({ version: '999.0.0' }), { status: 200 }),
    );

    service.init();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('reloads when the service worker reports VERSION_READY', async () => {
    configure({ swEnabled: true });
    fetchSpy = spyOn(window, 'fetch').and.resolveTo(
      new Response(JSON.stringify({ version: APP_VERSION }), { status: 200 }),
    );
    activateUpdateSpy.and.resolveTo(true);

    service.init();
    await Promise.resolve();

    versionUpdates.next({
      type: 'VERSION_READY',
      currentVersion: { hash: 'old' },
      latestVersion: { hash: 'new' },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('ignores a missing version.json (e.g. ng serve) without throwing', async () => {
    configure({ swEnabled: false });
    fetchSpy = spyOn(window, 'fetch').and.rejectWith(new Error('network error'));

    expect(() => service.init()).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
