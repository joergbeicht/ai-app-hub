import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Erste eigene Datenbank für `app-hub-backend` (siehe ADR-17) - bislang war dieser Service
 * komplett zustandslos (Rollen über Microsoft Graph, Tablet-Zugangsdaten über Key Vault).
 * `DATABASE_URL` ist bewusst ohne unsicheren Default (siehe ai-daten-orchestrator/PrismaService) -
 * ein fehlender Wert soll den Start sichtbar abbrechen, nicht stillschweigend gegen eine falsche
 * DB verbinden.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly pool: Pool;

  constructor() {
    const databaseUrl = process.env['DATABASE_URL'];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required (no insecure default).');
    }

    const pool = new Pool({ connectionString: databaseUrl });
    const adapter = new PrismaPg(pool);
    super({ adapter });
    this.pool = pool;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    await this.pool.end();
  }
}
