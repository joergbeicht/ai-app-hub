import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { HealthModule } from './health/health.module';
import { UsersModule } from './users/users.module';
import { BadgeLoginModule } from './badge-login/badge-login.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Nur für den öffentlichen Badge-Lookup gebraucht (siehe `BadgeLoginController`) - alle
    // anderen Endpunkte verlangen ohnehin ein gültiges Access Token (`AzureJwtGuard`).
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 20 }] }),
    HealthModule,
    UsersModule,
    BadgeLoginModule,
  ],
})
export class AppModule {}
