import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  /** Für Docker-Healthcheck / K8s Liveness-/Readiness-Probe (siehe `deployment.mdc`). Kein Auth-Guard. */
  @Get()
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
