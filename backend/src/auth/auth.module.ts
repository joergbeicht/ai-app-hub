import { DynamicModule, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { resolveAuthMode } from './auth-mode';
import { AzureJwtGuard } from './azure-jwt.guard';
import { HubAuthGuard, REQUEST_AUTHENTICATOR } from './hub-auth.guard';
import { BFF_CONFIG, createBffConfig } from './bff/bff-config';
import { AuthSessionService } from './bff/auth-session.service';
import { BffAuthController } from './bff/bff-auth.controller';
import { BffAuthService } from './bff/bff-auth.service';
import { OidcClientService } from './bff/oidc-client.service';
import { SessionAccessService } from './bff/session-access.service';
import { SessionAuthGuard, SessionCookieGuard } from './bff/session-auth.guard';
import { TOKEN_CIPHER, createTokenCipher } from './bff/token-cipher';
import {
  IAM_CLIENT_CONFIG,
  IamClientService,
  createIamClientConfig,
} from '../iam/iam-client.service';
import { IamProxyController } from '../iam/iam-proxy.controller';

/**
 * Wählt den Anmeldeweg anhand von `AUTH_MODE` (ADR-19). Im Keycloak-Modus werden die
 * Entra-Guards gar nicht erst erzeugt (und umgekehrt), damit jeder Modus nur seine eigene
 * Konfiguration braucht. Die Axora IAM (ADR-20) gibt es nur im Keycloak-Modus.
 */
@Module({})
export class AuthModule {
  static forRoot(): DynamicModule {
    return resolveAuthMode(process.env['AUTH_MODE']) === 'keycloak'
      ? keycloakAuthModule()
      : entraAuthModule();
  }
}

function keycloakAuthModule(): DynamicModule {
  return {
    module: AuthModule,
    global: true,
    controllers: [BffAuthController, IamProxyController],
    providers: [
      { provide: BFF_CONFIG, useFactory: createBffConfig, inject: [ConfigService] },
      { provide: TOKEN_CIPHER, useFactory: createTokenCipher, inject: [ConfigService] },
      { provide: IAM_CLIENT_CONFIG, useFactory: createIamClientConfig, inject: [ConfigService] },
      IamClientService,
      AuthSessionService,
      OidcClientService,
      BffAuthService,
      SessionAccessService,
      SessionCookieGuard,
      SessionAuthGuard,
      { provide: REQUEST_AUTHENTICATOR, useExisting: SessionAuthGuard },
      HubAuthGuard,
    ],
    exports: [REQUEST_AUTHENTICATOR, HubAuthGuard],
  };
}

function entraAuthModule(): DynamicModule {
  return {
    module: AuthModule,
    global: true,
    providers: [
      AzureJwtGuard,
      { provide: REQUEST_AUTHENTICATOR, useExisting: AzureJwtGuard },
      HubAuthGuard,
    ],
    exports: [REQUEST_AUTHENTICATOR, HubAuthGuard],
  };
}
