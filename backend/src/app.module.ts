import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { BadgeLoginModule } from './badge-login/badge-login.module';
import { TabletAuthModule } from './tablet-auth/tablet-auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Nur für den öffentlichen Badge-Lookup und den Tablet-PIN-Login gebraucht (siehe
    // `BadgeLoginController`/`TabletAuthController`) - alle anderen Endpunkte verlangen ohnehin
    // ein gültiges Access Token (`AzureJwtGuard`). Der strengere Tablet-Login-Throttle wird per
    // `@Throttle()` auf `TabletAuthController` überschrieben (siehe ADR-12).
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 20 }] }),
    HealthModule,
    UsersModule,
    BadgeLoginModule,
    TabletAuthModule,
  ],
})
export class AppModule {}
