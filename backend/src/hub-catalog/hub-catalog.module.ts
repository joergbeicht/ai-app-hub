import { Module } from '@nestjs/common';
import { HubCatalogController } from './hub-catalog.controller';
import { HubCatalogService } from './hub-catalog.service';

@Module({
  controllers: [HubCatalogController],
  providers: [HubCatalogService],
})
export class HubCatalogModule {}
