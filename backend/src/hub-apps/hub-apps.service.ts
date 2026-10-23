import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { HubAppContentDto, HubAppDto } from './dto/hub-app.dto';

interface HubAppRow {
  id: string;
  name: unknown;
  description: unknown;
  url: string;
  iconType: string;
  icon: string;
  sortOrder: number;
}

/**
 * Der zentrale, für alle Benutzer gültige App-Katalog (siehe ADR-17) - ersetzt die frühere,
 * pro Browser unterschiedliche `localStorage`-Kopie von `konfiguration.json`. Persönliche
 * Präferenzen (Reihenfolge/Sichtbarkeit) bleiben bewusst im Frontend, nicht hier (YAGNI/Trennung
 * der Concerns: "was gibt es" vs. "was zeige ich mir persönlich an").
 */
@Injectable()
export class HubAppsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<HubAppDto[]> {
    const rows = await this.prisma.hubApp.findMany({ orderBy: { sortOrder: 'asc' } });
    return rows.map((row) => this.toDto(row));
  }

  /**
   * Ersetzt den gesamten Katalog transaktional (Administrator-only, siehe `HubAppsController`):
   * IDs aus dem Body werden per Upsert geschrieben (`sortOrder` = Position im Array), IDs, die
   * nicht mehr enthalten sind, wurden im Frontend entfernt und werden gelöscht.
   */
  async replaceAll(apps: HubAppContentDto[]): Promise<HubAppDto[]> {
    const ids = apps.map((app) => app.id);
    const rows = await this.prisma.$transaction(async (tx) => {
      await tx.hubApp.deleteMany({ where: { id: { notIn: ids } } });
      const upserted: HubAppRow[] = [];
      for (const [index, app] of apps.entries()) {
        const data = {
          name: app.name as unknown as Prisma.InputJsonValue,
          description: app.description as unknown as Prisma.InputJsonValue,
          url: app.url,
          iconType: app.iconType,
          icon: app.icon,
          sortOrder: index,
        };
        const row = await tx.hubApp.upsert({
          where: { id: app.id },
          create: { id: app.id, ...data },
          update: data,
        });
        upserted.push(row);
      }
      return upserted;
    });
    return rows.map((row) => this.toDto(row));
  }

  private toDto(row: HubAppRow): HubAppDto {
    return {
      id: row.id,
      name: row.name as HubAppDto['name'],
      description: row.description as HubAppDto['description'],
      url: row.url,
      iconType: row.iconType === 'image' ? 'image' : 'mat-icon',
      icon: row.icon,
      sortOrder: row.sortOrder,
    };
  }
}
