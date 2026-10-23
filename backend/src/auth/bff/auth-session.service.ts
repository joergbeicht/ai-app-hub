import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  LOGIN_TRANSACTION_LIFETIME_MS,
  SESSION_ABSOLUTE_LIFETIME_MS,
  SESSION_IDLE_TIMEOUT_MS,
  SESSION_TOUCH_INTERVAL_MS,
} from './bff.constants';
import { hashToken, randomToken } from './secure-token';

/** Was nach dem Login über die Person gespeichert wird (aus dem geprüften ID-Token). */
export interface SessionIdentity {
  subject: string;
  displayName: string;
  email: string | null;
  roles: string[];
  idToken: string;
}

export interface ActiveSession {
  subject: string;
  displayName: string;
  email: string | null;
  roles: string[];
  csrfToken: string;
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
 * Serverseitige Sitzungen des Keycloak-BFF (ADR-19). Cookie-Werte werden nur gehasht
 * gespeichert; abgelaufene Sitzungen (absolut oder durch Inaktivität) gelten als nicht vorhanden
 * und werden beim Zugriff gelöscht.
 */
@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

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

  async createSession(identity: SessionIdentity): Promise<CreatedSession> {
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
        roles: identity.roles,
        idToken: identity.idToken,
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
      await this.prisma.authSession.deleteMany({ where: { id } });
      return null;
    }
    if (idleSince >= SESSION_TOUCH_INTERVAL_MS) {
      await this.prisma.authSession.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
    }

    return {
      subject: session.subject,
      displayName: session.displayName,
      email: session.email,
      roles: session.roles,
      csrfToken: session.csrfToken,
    };
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
    await this.prisma.authSession.deleteMany({ where: { id } });
    return session.idToken;
  }
}
