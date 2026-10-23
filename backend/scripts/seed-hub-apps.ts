/**
 * Befüllt den zentralen App-Katalog (`hub_apps`, siehe ADR-17) einmalig mit dem bisherigen
 * Startbestand aus `frontend/src/assets/konfiguration.json`. Danach ist die Datenbank die einzige
 * Wahrheit - `konfiguration.json` bleibt nur noch als historischer Startbestand im Repo, das
 * Frontend liest den Katalog ab jetzt ausschließlich über `GET /hub-apps`.
 *
 * Idempotent (Upsert per Id) - beliebig oft ausführbar, überschreibt aber Admin-Änderungen in der
 * DB mit dem Datei-Stand. Gedacht für die einmalige Erstbefüllung einer neuen/leeren DB
 * (lokal oder pro Kunden-Cluster), nicht als laufender Sync-Mechanismus.
 *
 * Nutzung: DATABASE_URL=... npm run seed:hub-apps (vom Host, nicht im Backend-Container - der
 * Container hat `frontend/` nicht gemountet; lokal reicht ein Port-Forward/die Compose-DB-URL).
 *
 * `--if-empty`: schreibt nur, wenn der Katalog noch leer ist - so kann die Deploy-Pipeline den
 * Startbestand einer neuen Umgebung anlegen, ohne je Admin-Änderungen zu überschreiben.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

interface RawAppEntry {
  id: string;
  name: Record<string, string>;
  description: Record<string, string>;
  url: string;
  iconType?: string;
  icon: string;
}

interface RawAppConfig {
  apps?: RawAppEntry[];
}

function loadKonfigurationJson(): RawAppEntry[] {
  const path = join(__dirname, '../../frontend/src/assets/konfiguration.json');
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawAppConfig;
  return raw.apps ?? [];
}

async function seedHubApps(onlyIfEmpty: boolean): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required.');
  }
  const pool = new Pool({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    if (onlyIfEmpty) {
      const existing = await prisma.hubApp.count();
      if (existing > 0) {
        console.log(`Catalog already has ${existing} hub apps - skipping seed (--if-empty).`);
        return;
      }
    }
    const apps = loadKonfigurationJson();
    for (const [index, app] of apps.entries()) {
      const data = {
        name: app.name,
        description: app.description,
        url: app.url,
        iconType: app.iconType === 'image' ? 'image' : 'mat-icon',
        icon: app.icon,
        sortOrder: index,
      };
      await prisma.hubApp.upsert({
        where: { id: app.id },
        create: { id: app.id, ...data },
        update: data,
      });
      console.log(`  ✔ ${app.id}`);
    }
    console.log(`\nSeeded ${apps.length} hub apps.`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

seedHubApps(process.argv.includes('--if-empty')).catch((error: unknown) => {
  console.error('\nSeeding hub apps failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
