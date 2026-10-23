import { HubAppsService } from './hub-apps.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { HubAppContentDto } from './dto/hub-app.dto';

const emptyLocalizedText = () => ({ de: '', en: '', es: '', fr: '', tr: '', it: '' });

describe('HubAppsService', () => {
  interface MockTx {
    hubApp: {
      deleteMany: jest.Mock;
      upsert: jest.Mock;
    };
  }

  function createService(rows: unknown[]) {
    const tx: MockTx = {
      hubApp: {
        deleteMany: jest.fn().mockResolvedValue(undefined),
        upsert: jest.fn(),
      },
    };
    const prisma = {
      hubApp: {
        findMany: jest.fn().mockResolvedValue(rows),
      },
      $transaction: jest.fn(async (callback: (tx: MockTx) => Promise<unknown>) => callback(tx)),
    } as unknown as jest.Mocked<PrismaService>;
    return { service: new HubAppsService(prisma), prisma, tx };
  }

  it('returns apps ordered by sortOrder, mapped to the frontend AppEntry shape', async () => {
    const rows = [
      {
        id: 'app-a',
        name: { ...emptyLocalizedText(), de: 'App A' },
        description: emptyLocalizedText(),
        url: 'http://localhost:4200',
        iconType: 'mat-icon',
        icon: 'apps',
        sortOrder: 0,
      },
    ];
    const { service, prisma } = createService(rows);

    const result = await service.findAll();

    expect(prisma.hubApp.findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
    expect(result).toEqual([
      {
        id: 'app-a',
        name: { ...emptyLocalizedText(), de: 'App A' },
        description: emptyLocalizedText(),
        url: 'http://localhost:4200',
        iconType: 'mat-icon',
        icon: 'apps',
        sortOrder: 0,
      },
    ]);
  });

  it('replaceAll deletes ids no longer present and upserts the rest with sortOrder = array index', async () => {
    const { service, tx } = createService([]);
    tx.hubApp.upsert.mockImplementation(
      ({ where, create }: { where: { id: string }; create: Record<string, unknown> }) =>
        Promise.resolve({ ...create, id: where.id }),
    );
    const apps: HubAppContentDto[] = [
      {
        id: 'app-b',
        name: emptyLocalizedText(),
        description: emptyLocalizedText(),
        url: 'http://localhost:4201',
        iconType: 'mat-icon',
        icon: 'widgets',
      },
      {
        id: 'app-a',
        name: emptyLocalizedText(),
        description: emptyLocalizedText(),
        url: 'http://localhost:4200',
        iconType: 'mat-icon',
        icon: 'apps',
      },
    ] as HubAppContentDto[];

    const result = await service.replaceAll(apps);

    expect(tx.hubApp.deleteMany).toHaveBeenCalledWith({
      where: { id: { notIn: ['app-b', 'app-a'] } },
    });
    expect(tx.hubApp.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'app-b' },
        create: expect.objectContaining({ id: 'app-b', sortOrder: 0 }),
      }),
    );
    expect(tx.hubApp.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: 'app-a' },
        create: expect.objectContaining({ id: 'app-a', sortOrder: 1 }),
      }),
    );
    expect(result.map((app) => app.id)).toEqual(['app-b', 'app-a']);
  });
});
