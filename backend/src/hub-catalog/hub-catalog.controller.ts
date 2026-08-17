import { Controller, Get } from '@nestjs/common';
import { HubCatalogService } from './hub-catalog.service';

@Controller('hub-catalog-urls')
export class HubCatalogController {
  constructor(private readonly hubCatalogService: HubCatalogService) {}

  /**
   * Öffentlich, kein Auth-Guard: liefert nur nicht-sensible Zuordnungen App-ID -> echte URL,
   * die ohnehin schon als Kachel-Link im Hub sichtbar sind. Wird vom Frontend beim Start
   * abgefragt, um die Dev-URLs aus `konfiguration.json` durch die echten Cluster-URLs zu
   * ersetzen (siehe `ConfigService.load`).
   */
  @Get()
  getUrls(): Promise<Record<string, string>> {
    return this.hubCatalogService.getCatalogUrls();
  }
}
