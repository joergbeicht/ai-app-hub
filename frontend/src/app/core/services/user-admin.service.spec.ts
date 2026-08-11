import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { UserAdminService } from './user-admin.service';
import { RUNTIME_CONFIG } from '../runtime-config';

describe('UserAdminService', () => {
  let service: UserAdminService;
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
    service = TestBed.inject(UserAdminService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('lists users from the backend', () => {
    const users = [{ id: 'u1', displayName: 'Sam', email: 'sam@axora.local', role: 'Guest' as const }];

    service.listUsers().subscribe((result) => expect(result).toEqual(users));

    const req = httpMock.expectOne(`${backendApiUrl}/users`);
    expect(req.request.method).toBe('GET');
    req.flush(users);
  });

  it('updates a user role via PATCH', () => {
    const updated = { id: 'u1', displayName: 'Sam', email: 'sam@axora.local', role: 'Administrator' as const };

    service.updateRole('u1', 'Administrator').subscribe((result) => expect(result).toEqual(updated));

    const req = httpMock.expectOne(`${backendApiUrl}/users/u1/role`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'Administrator' });
    req.flush(updated);
  });
});
