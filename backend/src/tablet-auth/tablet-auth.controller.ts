import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { TabletAuthService } from './tablet-auth.service';
import { TabletLoginDto } from './dto/tablet-login.dto';
import { TabletRenewDto } from './dto/tablet-renew.dto';
import { TabletAuthResultDto } from './dto/tablet-auth-result.dto';

/**
 * Bewusst OHNE `AzureJwtGuard` (siehe `BadgeLoginController`) - das ist ja gerade der Login selbst
 * (siehe ADR-12). Enger gedrosselt als `BadgeLoginController` (10/min statt 20/min pro IP), weil
 * hier ein PIN erraten werden könnte - der eigentliche Schutz ist aber das Pro-Konto-Lockout in
 * `TabletAuthService`, das Rate-Limiting hier ist nur eine zusätzliche Netzwerk-Ebene.
 */
@Controller('tablet-auth')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class TabletAuthController {
  constructor(private readonly tabletAuthService: TabletAuthService) {}

  @Post('login')
  login(@Body() dto: TabletLoginDto): Promise<TabletAuthResultDto> {
    return this.tabletAuthService.loginWithPin(dto.badgeCode, dto.pin);
  }

  @Post('renew')
  renew(@Body() dto: TabletRenewDto): Promise<TabletAuthResultDto> {
    return this.tabletAuthService.renewWithDeviceToken(dto.deviceToken);
  }
}
