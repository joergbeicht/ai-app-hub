import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';

function createContext(roles: string[] | undefined): ExecutionContext {
  const request = { user: { roles } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  function createGuard(requiredRoles: string[] | undefined) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRoles) } as unknown as Reflector;
    return new RolesGuard(reflector);
  }

  it('allows access when no roles are required', () => {
    const guard = createGuard(undefined);

    expect(guard.canActivate(createContext(['User']))).toBe(true);
  });

  it('allows access when the user has one of the required roles', () => {
    const guard = createGuard(['Administrator']);

    expect(guard.canActivate(createContext(['User', 'Administrator']))).toBe(true);
  });

  it('denies access when the user has none of the required roles', () => {
    const guard = createGuard(['Administrator']);

    expect(() => guard.canActivate(createContext(['User']))).toThrow(ForbiddenException);
  });

  it('denies access when the roles claim is empty (unassigned / Guest fallback)', () => {
    const guard = createGuard(['Administrator']);

    expect(() => guard.canActivate(createContext(undefined))).toThrow(ForbiddenException);
  });
});
