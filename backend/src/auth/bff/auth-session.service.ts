import { Inject, Injectable } from '@nestjs/common';
import type { AuthSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isHubRole, type HubAccess } from '../../iam/hub-access';
import {
  LOGIN_TRANSACTION_LIFETIME_MS,
  SESSION_ABSOLUTE_LIFETIME_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from './bff.constants';
import { hashToken, randomToken } from './secure-token';
import { TOKEN_CIPHER, type TokenCipher } from './token-cipher';

/** Was nach dem Login über die Person gespeichert wird (aus dem geprüften ID-Token). */
export interface SessionIdentity {
  subject: string;
  displayName: string;
  email: string | null;
  idToken: string;
}

/** Keycloak-Tokens der Sitzung; bleiben im Backend und liegen nur verschlüsselt in der DB. */
export interface SessionTokens {
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  /** Keycloak liefert beim Refresh ein neues ID-Token; es ersetzt dann den Logout-Hint. */
  idToken?: string;
}

export interface ActiveSession extends HubAccess {
  /** Hash des Cookie-Werts, Schlüssel für Updates der Sitzung. */
  id: string;
  subject: string;
  displayName: string;
  email: string | null;
  csrfToken: string;
  accessCheckedAt: Date;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
}

export interface LoginTransaction {
  state: string;
  nonce: string;
  codeVerifier: string;
  returnTo: string;
}

/** `handle` geht als Cookie an den Browser; in der DB liegt nur dessen Hash. */
export interface StartedLoginTransaction extends LoginTransaction {
  handle: string;
}

export interface CreatedSession {
  handle: string;
  expiresAt: Date;
}

/**
 * Serverseitige Sitzungen des Keycloak-BFF (ADR-19, ADR-20). Cookie-Werte werden nur gehasht
 * gespeichert, Tokens nur verschlüsselt; abgelaufene Sitzungen (absolut oder durch Inaktivität)
 * gelten als nicht vorhanden und werden beim Zugriff gelöscht.
 */
@Injectable()
export class AuthSessionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(TOKEN_CIPHER) private readonly cipher: TokenCipher,
  ) {}

  async startLoginTransaction(returnTo: string): Promise<StartedLoginTransaction> {
    const now = Date.now();
    await this.prisma.authLoginTransaction.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });

    const transaction: StartedLoginTransaction = {
      handle: randomToken(),
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier: randomToken(),
      returnTo,
    };
    await this.prisma.authLoginTransaction.create({
      data: {
        id: hashToken(transaction.handle),
        state: transaction.state,
        nonce: transaction.nonce,
        codeVerifier: transaction.codeVerifier,
        returnTo: transaction.returnTo,
        expiresAt: new Date(now + LOGIN_TRANSACTION_LIFETIME_MS),
      },
    });
    return transaction;
  }

  /** Genau einmal verwendbar: ein zweiter Callback mit demselben Cookie bekommt `null`. */
  async consumeLoginTransaction(handle: string | undefined): Promise<LoginTransaction | null> {
    if (!handle) {
      return null;
    }
    const id = hashToken(handle);
    const transaction = await this.prisma.authLoginTransaction.findUnique({ where: { id } });
    if (!transaction) {
      return null;
    }
    const { count } = await this.prisma.authLoginTransaction.deleteMany({ where: { id } });
    if (count === 0 || transaction.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return {
      state: transaction.state,
      nonce: transaction.nonce,
      codeVerifier: transaction.codeVerifier,
      returnTo: transaction.returnTo,
    };
  }

  async createSession(
    identity: SessionIdentity,
    tokens: SessionTokens,
    access: HubAccess,
  ): Promise<CreatedSession> {
    const now = Date.now();
    await this.prisma.authSession.deleteMany({ where: { expiresAt: { lte: new Date(now) } } });

    const handle = randomToken();
    const expiresAt = new Date(now + SESSION_ABSOLUTE_LIFETIME_MS);
    await this.prisma.authSession.create({
      data: {
        id: hashToken(handle),
        subject: identity.subject,
        displayName: identity.displayName,
        email: identity.email,
        idToken: identity.idToken,
        ...this.sealTokens(tokens),
        ...accessColumns(access, new Date(now)),
        csrfToken: randomToken(),
        expiresAt,
        lastSeenAt: new Date(now),
      },
    });
    return { handle, expiresAt };
  }

  async findActiveSession(handle: string | undefined): Promise<ActiveSession | null> {
    if (!handle) {
      return null;
    }
    const id = hashToken(handle);
    const session = await this.prisma.authSession.findUnique({ where: { id } });
    if (!session) {
      return null;
    }

    const now = Date.now();
    const idleSince = now - session.lastSeenAt.getTime();
    if (session.expiresAt.getTime() <= now || idleSince >= SESSION_IDLE_TIMEOUT_MS) {
      await this.deleteSession(id);
      return null;
    }
    if (idleSince >= SESSION_TOUCH_INTERVAL_MS) {
      await this.prisma.authSession.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
    }
    return this.toActiveSession(session);
  }

  async storeTokens(session: ActiveSession, tokens: SessionTokens): Promise<ActiveSession> {
    const updated = await this.prisma.authSession.update({
      where: { id: session.id },
      data: this.sealTokens(tokens),
    });
    return this.toActiveSession(updated);
  }

  async storeAccess(session: ActiveSession, access: HubAccess): Promise<ActiveSession> {
    const updated = await this.prisma.authSession.update({
      where: { id: session.id },
      data: accessColumns(access, new Date()),
    });
    return this.toActiveSession(updated);
  }

  /** Beendet eine Sitzung serverseitig, z. B. wenn Keycloak oder die IAM den Zugriff entzogen haben. */
  async deleteSession(id: string): Promise<void> {
    await this.prisma.authSession.deleteMany({ where: { id } });
  }

  /** Liefert das ID-Token für den Keycloak-Logout (`id_token_hint`), falls die Sitzung existierte. */
  async endSession(handle: string | undefined): Promise<string | null> {
    if (!handle) {
      return null;
    }
    const id = hashToken(handle);
    const session = await this.prisma.authSession.findUnique({ where: { id } });
    if (!session) {
      return null;
    }
    await this.deleteSession(id);
    return session.idToken;
  }

  private sealTokens(tokens: SessionTokens) {
    return {
      accessToken: this.cipher.encrypt(tokens.accessToken),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshToken: this.cipher.encrypt(tokens.refreshToken),
      ...(tokens.idToken ? { idToken: tokens.idToken } : {}),
    };
  }

  private toActiveSession(session: AuthSession): ActiveSession {
    return {
      id: session.id,
      subject: session.subject,
      displayName: session.displayName,
      email: session.email,
      csrfToken: session.csrfToken,
      organizationId: session.organizationId,
      organizationName: session.organizationName,
      permissions: session.permissions,
      roles: session.roles.filter(isHubRole),
      accessCheckedAt: session.accessCheckedAt,
      accessToken: this.cipher.decrypt(session.accessToken),
      accessTokenExpiresAt: session.accessTokenExpiresAt,
      refreshToken: this.cipher.decrypt(session.refreshToken),
    };
  }
}

function accessColumns(access: HubAccess, checkedAt: Date) {
  return {
    organizationId: access.organizationId,
    organizationName: access.organizationName,
    permissions: access.permissions,
    roles: access.roles,
    accessCheckedAt: checkedAt,
  };
}
