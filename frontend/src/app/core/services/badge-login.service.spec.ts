import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BadgeLoginService } from './badge-login.service';
import { RUNTIME_CONFIG } from '../runtime-config';

describe('BadgeLoginService', () => {
  let service: BadgeLoginService;
  let httpMock: HttpTestingController;
  const backendApiUrl = 'https://backend.example.com';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: RUNTIME_CONFIG,
          useValue: { clusterName: 'test', azureTenantId: 't', azureClientId: 'c', backendApiUrl },
        },
      ],
    });
    service = TestBed.inject(BadgeLoginService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('resolves the badge code to a user principal name', () => {
    service
      .lookupByBadgeCode('EMP-12345')
      .subscribe((result) => expect(result).toBe('lisa@axora.local'));

    const req = httpMock.expectOne(`${backendApiUrl}/badge-login/EMP-12345`);
    expect(req.request.method).toBe('GET');
    req.flush({ userPrincipalName: 'lisa@axora.local' });
  });

  it('URL-encodes the badge code before calling the backend', () => {
    service.lookupByBadgeCode('EMP 123/456').subscribe();

    const req = httpMock.expectOne(`${backendApiUrl}/badge-login/EMP%20123%2F456`);
    req.flush({ userPrincipalName: 'lisa@axora.local' });
  });
});
