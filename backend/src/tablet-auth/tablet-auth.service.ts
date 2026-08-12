import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { GraphService, GraphUser } from '../graph/graph.service';
import { KeyVaultService } from './key-vault.service';
import { RopcTokenService } from './ropc-token.service';
import { TabletSessionTokenService } from './tablet-session-token.service';
import { TabletCredential } from './tablet-credential.model';
import { TabletAuthResultDto } from './dto/tablet-auth-result.dto';
import {
  LOCKOUT_DURATION_MS,
  MAX_FAILED_PIN_ATTEMPTS,
  SESSION_TOKEN_TTL_SECONDS,
} from './tablet-auth.constants';

/**
 * Orchestriert den PIN+ROPC-Login für Tablet-Benutzer (siehe ADR-12): Badge-Code → Entra-Nutzer +
 * Gruppen-Check → PIN-Vergleich/Lockout (Key Vault) → ROPC-Austausch → eigenes Session-/
 * Device-Token. Bewusst getrennt von `BadgeLoginService` (ADR-7, "Weg A") - unterschiedliche
 * Sicherheitsanforderungen (hier: echtes Passwort im Backend, Gruppen-Gate, Lockout).
 */
@Injectable()
export class TabletAuthService {
  constructor(
    private readonly graphService: GraphService,
    private readonly keyVaultService: KeyVaultService,
    private readonly ropcTokenService: RopcTokenService,
    private readonly tokenService: TabletSessionTokenService,
    private readonly configService: ConfigService,
  ) {}

  async loginWithPin(badgeCode: string, pin: string): Promise<TabletAuthResultDto> {
    const user = await this.resolveTabletUser(badgeCode);
    const credential = await this.requireCredential(badgeCode);
    this.assertNotLocked(credential);

    const pinMatches = await bcrypt.compare(pin, credential.pinHash);
    if (!pinMatches) {
      await this.recordFailedAttempt(badgeCode, credential);
      throw new UnauthorizedException('Incorrect PIN');
    }

    await this.resetFailedAttempts(badgeCode, credential);
    return this.issueTokens(badgeCode, user, credential);
  }

  async renewWithDeviceToken(deviceToken: string): Promise<TabletAuthResultDto> {
    const claims = this.tokenService.verifyDeviceToken(deviceToken);
    const user = await this.resolveTabletUser(claims.badgeCode);
    const credential = await this.requireCredential(claims.badgeCode);
    return this.issueTokens(claims.badgeCode, user, credential);
  }

  /** Badge-Lookup + Gruppen-Gate - nur Mitglieder von `TABLET_USERS_GROUP_ID` dürfen diesen Flow nutzen. */
  private async resolveTabletUser(badgeCode: string): Promise<GraphUser> {
    const user = await this.graphService.findUserByEmployeeId(badgeCode);
    if (!user) {
      throw new NotFoundException('No user is linked to this badge code');
    }

    const groupId = this.configService.get<string>('TABLET_USERS_GROUP_ID');
    if (!groupId) {
      throw new ServiceUnavailableException(
        'Tablet login is not configured for this cluster (TABLET_USERS_GROUP_ID missing)',
      );
    }
    const isTabletUser = await this.graphService.isMemberOfGroup(user.id, groupId);
    if (!isTabletUser) {
      throw new ForbiddenException('This account is not enabled for tablet login');
    }
    return user;
  }

  private async requireCredential(badgeCode: string): Promise<TabletCredential> {
    const credential = await this.keyVaultService.getCredential(badgeCode);
    if (!credential) {
      throw new NotFoundException('No tablet credential found for this badge code');
    }
    return credential;
  }

  private assertNotLocked(credential: TabletCredential): void {
    if (credential.lockedUntil && new Date(credential.lockedUntil).getTime() > Date.now()) {
      throw new ForbiddenException('Too many failed attempts - try again later');
    }
  }

  private async recordFailedAttempt(
    badgeCode: string,
    credential: TabletCredential,
  ): Promise<void> {
    const failedAttempts = credential.failedAttempts + 1;
    const isNowLocked = failedAttempts >= MAX_FAILED_PIN_ATTEMPTS;
    await this.keyVaultService.saveCredential(badgeCode, {
      ...credential,
      failedAttempts,
      lockedUntil: isNowLocked
        ? new Date(Date.now() + LOCKOUT_DURATION_MS).toISOString()
        : credential.lockedUntil,
    });
  }

  private async resetFailedAttempts(
    badgeCode: string,
    credential: TabletCredential,
  ): Promise<void> {
    if (credential.failedAttempts === 0 && !credential.lockedUntil) {
      return;
    }
    await this.keyVaultService.saveCredential(badgeCode, {
      ...credential,
      failedAttempts: 0,
      lockedUntil: null,
    });
  }

  private async issueTokens(
    badgeCode: string,
    user: GraphUser,
    credential: TabletCredential,
  ): Promise<TabletAuthResultDto> {
    const entraClaims = await this.ropcTokenService.signInWithPassword(
      credential.userPrincipalName,
      credential.entraPassword,
    );
    const roles = entraClaims.roles ?? [];
    const tokenClaims = {
      sub: user.id,
      badgeCode,
      displayName: user.displayName,
      upn: user.userPrincipalName,
      roles,
    };

    return {
      sessionToken: this.tokenService.issueSessionToken(tokenClaims),
      deviceToken: this.tokenService.issueDeviceToken(tokenClaims),
      expiresIn: SESSION_TOKEN_TTL_SECONDS,
      displayName: user.displayName,
      userPrincipalName: user.userPrincipalName,
      roles,
    };
  }
}
