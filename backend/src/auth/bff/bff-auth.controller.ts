import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { LOGIN_TRANSACTION_COOKIE, SESSION_COOKIE } from './bff.constants';
import { BffAuthService, LoginFlowError } from './bff-auth.service';
import { SessionAuthGuard, SessionCookieGuard, type SessionRequest } from './session-auth.guard';
import {
  clearedCookieOptions,
  loginTransactionCookieOptions,
  readCookie,
  sessionCookieOptions,
} from './session-cookie';
import type { LogoutResponseDto, SessionViewDto } from './dto/session-view.dto';

/**
 * Browser-Endpunkte des Keycloak-BFF (ADR-19). `login` und `callback` sind Top-Level-
 * Navigationen: Fehler enden deshalb als Redirect auf die Login-Seite statt als JSON.
 */
@Controller('auth')
export class BffAuthController {
  private readonly logger = new Logger(BffAuthController.name);

  constructor(private readonly bffAuth: BffAuthService) {}

  @Get('login')
  async login(@Query('returnTo') returnTo: string | undefined, @Res() res: Response): Promise<void> {
    try {
      const { redirectUrl, transactionHandle } = await this.bffAuth.beginLogin(returnTo);
      res.cookie(LOGIN_TRANSACTION_COOKIE, transactionHandle, loginTransactionCookieOptions());
      res.redirect(HttpStatus.FOUND, redirectUrl);
    } catch (error) {
      this.logger.error(`Login could not be started: ${errorMessage(error)}`);
      res.redirect(HttpStatus.FOUND, this.bffAuth.loginErrorUrl('unavailable'));
    }
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const transactionHandle = readCookie(req, LOGIN_TRANSACTION_COOKIE);
    res.clearCookie(LOGIN_TRANSACTION_COOKIE, clearedCookieOptions());
    try {
      const login = await this.bffAuth.completeLogin(transactionHandle, req);
      res.cookie(SESSION_COOKIE, login.sessionHandle, sessionCookieOptions(login.expiresAt));
      res.redirect(HttpStatus.FOUND, login.redirectUrl);
    } catch (error) {
      const code = error instanceof LoginFlowError ? error.code : 'login_failed';
      this.logger.warn(`Login callback rejected (${code}): ${errorMessage(error)}`);
      res.redirect(HttpStatus.FOUND, this.bffAuth.loginErrorUrl(code));
    }
  }

  @Get('session')
  @UseGuards(SessionAuthGuard)
  session(@Req() req: SessionRequest): SessionViewDto {
    return this.bffAuth.toSessionView(req.authSession);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionCookieGuard)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    const logoutUrl = await this.bffAuth.logout(readCookie(req, SESSION_COOKIE));
    res.clearCookie(SESSION_COOKIE, clearedCookieOptions());
    return { logoutUrl };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
