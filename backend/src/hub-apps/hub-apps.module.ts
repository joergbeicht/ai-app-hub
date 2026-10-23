import { Module } from '@nestjs/common';
import { HubAppsController } from './hub-apps.controller';
import { HubAppsService } from './hub-apps.service';

@Module({
  controllers: [HubAppsController],
  providers: [HubAppsService],
})
export class HubAppsModule {}
