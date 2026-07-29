import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Knex } from 'knex';
import { tenantContext } from '../../src/common/tenant-context';
import { CustomizationService } from '../../src/customization/customization.service';

type Row = Record<string, any>;
type Tables = Record<string, Row[]>;

class FakeQuery {
  private filters: Array<(row: Row) => boolean> = [];
  private inserted: Row[] = [];
  private updated: Row[] = [];

  constructor(
    private readonly database: FakeDatabase,
    private readonly table: string,
  ) {}

  where(criteria: Row): this {
    this.filters.push((row) =>
      Object.entries(criteria).every(([key, value]) => row[key] === value),
    );
    return this;
  }

  whereNull(column: string): this {
    this.filters.push((row) => row[column] === null || row[column] === undefined);
    return this;
  }

  select(..._columns: unknown[]): this {
    return this;
  }

  join(..._args: unknown[]): this {
    return this;
  }

  orderBy(..._args: unknown[]): this {
    return this;
  }

  onConflict(..._columns: unknown[]): this {
    return this;
  }

  ignore(): this {
    return this;
  }

  merge(_changes: Row): this {
    return this;
  }

  async first<T = Row>(): Promise<T | undefined> {
    return this.rows()[0] as T | undefined;
  }

  insert(value: Row | Row[]): this {
    const values = Array.isArray(value) ? value : [value];
    this.inserted = values.map((row) => ({ ...row }));
    this.database.tables[this.table] ??= [];

    for (const row of this.inserted) {
      if (
        this.table === 'projects' &&
        row.is_system === true &&
        this.database.tables.projects!.some(
          (candidate) =>
            candidate.tenant_id === row.tenant_id &&
            candidate.folder_id === row.folder_id &&
            candidate.is_system === true &&
            candidate.deleted_at == null,
        )
      ) {
        continue;
      }
      this.database.tables[this.table]!.push(row);
    }
    return this;
  }

  update(changes: Row): this {
    this.updated = this.rows().map((row) => Object.assign(row, changes));
    return this;
  }

  async returning(_columns: string): Promise<Row[]> {
    return this.inserted.length > 0 ? this.inserted : this.updated;
  }

  private rows(): Row[] {
    return (this.database.tables[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => filter(row)),
    );
  }
}

class FakeDatabase {
  readonly transactionTables: string[][] = [];

  constructor(public tables: Tables) {}

  readonly knex = Object.assign(
    (table: string) => new FakeQuery(this, table),
    {
      transaction: async <T>(callback: (trx: Knex.Transaction) => Promise<T>): Promise<T> => {
        const snapshot = structuredClone(this.tables);
        const touchedBefore = Object.fromEntries(
          Object.entries(this.tables).map(([table, rows]) => [table, rows.length]),
        );
        try {
          const result = await callback(this.knex as unknown as Knex.Transaction);
          const touched = Object.entries(this.tables)
            .filter(([table, rows]) => rows.length !== (touchedBefore[table] ?? 0))
            .map(([table]) => table);
          this.transactionTables.push(touched);
          return result;
        } catch (error) {
          this.tables = snapshot;
          throw error;
        }
      },
    },
  ) as unknown as Knex;
}

const tenantA = '10000000-0000-4000-8000-000000000001';
const tenantB = '20000000-0000-4000-8000-000000000002';
const userA = '30000000-0000-4000-8000-000000000003';
const userB = '40000000-0000-4000-8000-000000000004';
const folderA = '50000000-0000-4000-8000-000000000005';
const folderB = '60000000-0000-4000-8000-000000000006';
const departmentA = '70000000-0000-4000-8000-000000000007';
const departmentB = '80000000-0000-4000-8000-000000000008';
const formA = '90000000-0000-4000-8000-000000000009';
const formB = 'a0000000-0000-4000-8000-00000000000a';
const projectA = 'b0000000-0000-4000-8000-00000000000b';

function fixtures(): Tables {
  return {
    request_forms: [
      {
        id: formA,
        tenant_id: tenantA,
        folder_id: folderA,
        created_by_id: userA,
        name: 'Grant Request',
        description: 'External grant intake',
        is_public: true,
        form_fields: [
          { name: 'title', type: 'text', required: true },
          { name: 'budget', type: 'number', required: true },
          {
            name: 'region',
            type: 'text',
            required: false,
            options: ['North', 'South'],
          },
        ],
      },
      {
        id: formB,
        tenant_id: tenantB,
        folder_id: folderB,
        created_by_id: userB,
        name: 'Other tenant form',
        is_public: true,
        form_fields: [{ name: 'title', type: 'text', required: true }],
      },
    ],
    folders: [
      {
        id: folderA,
        tenant_id: tenantA,
        workspace_id: departmentA,
        is_archived: false,
        deleted_at: null,
      },
      {
        id: folderB,
        tenant_id: tenantB,
        workspace_id: departmentB,
        is_archived: false,
        deleted_at: null,
      },
    ],
    projects: [
      {
        id: projectA,
        tenant_id: tenantA,
        folder_id: folderA,
        owner_id: userA,
        is_system: true,
        deleted_at: null,
      },
    ],
    tasks: [],
    task_folder_links: [],
    tenant_memberships: [],
    users: [],
  };
}

function runAsTenantA<T>(operation: () => Promise<T>): Promise<T> {
  return tenantContext.run(
    {
      tenantId: tenantA,
      userId: userA,
      membershipId: 'membership-a',
      role: 'admin',
      permissions: ['task:create'],
    },
    operation,
  );
}

describe('CustomizationService request forms', () => {
  it('submits an authenticated request into the folder system project atomically', async () => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    const task = await runAsTenantA(() =>
      service.submitRequestForm(formA, {
        title: 'Community Outreach',
        budget: '5000',
        region: 'North',
      }),
    );

    expect(task).toMatchObject({
      tenant_id: tenantA,
      project_id: projectA,
      department_id: departmentA,
      created_by_id: userA,
      title: 'Community Outreach',
      custom_fields: JSON.stringify({
        title: 'Community Outreach',
        budget: 5000,
        region: 'North',
      }),
    });
    expect(database.tables.task_folder_links).toContainEqual({
      tenant_id: tenantA,
      task_id: task.id,
      folder_id: folderA,
      is_home: true,
    });
    expect(database.transactionTables.at(-1)).toEqual(
      expect.arrayContaining(['tasks', 'task_folder_links']),
    );
  });

  it('creates and reuses a system inbox project for published public submissions', async () => {
    const data = fixtures();
    data.projects = [];
    const database = new FakeDatabase(data);
    const service = new CustomizationService(database.knex);

    const first = await service.submitPublicRequestForm(formA, {
      title: 'First request',
      budget: 10,
    });
    const second = await service.submitPublicRequestForm(formA, {
      title: 'Second request',
      budget: '20',
    });

    expect(database.tables.projects).toHaveLength(1);
    expect(database.tables.projects![0]).toMatchObject({
      tenant_id: tenantA,
      folder_id: folderA,
      owner_id: userA,
      name: 'General Tasks',
      is_system: true,
    });
    expect(first.project_id).toBe(database.tables.projects![0]!.id);
    expect(second.project_id).toBe(database.tables.projects![0]!.id);
    expect(first.tenant_id).toBe(tenantA);
    expect(first.department_id).toBe(departmentA);
  });

  it('rejects a submission when a required declared field is missing', async () => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    await expect(
      service.submitPublicRequestForm(formA, {
        title: 'Missing budget',
      }),
    ).rejects.toThrow(new BadRequestException('Field "budget" is required'));
    expect(database.tables.tasks).toHaveLength(0);
    expect(database.tables.projects).toHaveLength(1);
  });

  it.each([
    [{ title: 'Bad option', budget: 1, region: 'East' }, 'Field "region" has an invalid option'],
    [{ title: 'Bad number', budget: 'many' }, 'Field "budget" must be a number'],
    [{ title: 'Extra', budget: 1, secret: true }, 'Unknown field "secret"'],
  ])('rejects invalid declared field values', async (values, message) => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    await expect(service.submitPublicRequestForm(formA, values)).rejects.toThrow(
      new BadRequestException(message),
    );
    expect(database.tables.tasks).toHaveLength(0);
  });

  it('does not allow an authenticated tenant to submit another tenant form', async () => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    await expect(
      runAsTenantA(() => service.submitRequestForm(formB, { title: 'Cross tenant' })),
    ).rejects.toThrow(new NotFoundException('Request form not found'));
    expect(database.tables.tasks).toHaveLength(0);
  });

  it('does not expose or accept public submissions for a disabled form', async () => {
    const data = fixtures();
    data.request_forms![0]!.is_public = false;
    const database = new FakeDatabase(data);
    const service = new CustomizationService(database.knex);

    await expect(service.getPublicForm(formA)).rejects.toThrow(
      new NotFoundException('Request form not found'),
    );
    await expect(
      service.submitPublicRequestForm(formA, { title: 'Hidden', budget: 1 }),
    ).rejects.toThrow(new NotFoundException('Request form not found'));
    expect(database.tables.tasks).toHaveLength(0);
  });

  it('allows an authenticated tenant user to submit an unpublished form', async () => {
    const data = fixtures();
    data.request_forms![0]!.is_public = false;
    const database = new FakeDatabase(data);
    const service = new CustomizationService(database.knex);

    const task = await runAsTenantA(() =>
      service.submitRequestForm(formA, { title: 'Internal request', budget: 1 }),
    );

    expect(task).toMatchObject({ tenant_id: tenantA, created_by_id: userA });
  });

  it('defaults newly created request forms to private', async () => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    const form = await runAsTenantA(() =>
      service.createRequestForm({
        name: 'Private by default',
        folderId: folderA,
        fields: [{ name: 'title', type: 'text', required: true }],
      }),
    );

    expect(form).toMatchObject({ tenant_id: tenantA, is_public: false });
  });

  it('updates publication only for a form in the authenticated tenant', async () => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    await expect(
      runAsTenantA(() =>
        (service as unknown as { updateRequestFormPublication: (id: string, value: boolean) => Promise<unknown> })
          .updateRequestFormPublication(formB, false),
      ),
    ).rejects.toThrow(new NotFoundException('Request form not found'));
    expect(database.tables.request_forms![1]!.is_public).toBe(true);
  });

  it('treats a form whose target folder is archived as unavailable publicly', async () => {
    const data = fixtures();
    data.folders![0]!.is_archived = true;
    const database = new FakeDatabase(data);
    const service = new CustomizationService(database.knex);

    await expect(service.getPublicForm(formA)).rejects.toThrow(
      new NotFoundException('Request form not found'),
    );
    await expect(
      service.submitPublicRequestForm(formA, { title: 'Hidden', budget: 1 }),
    ).rejects.toThrow(new NotFoundException('Request form not found'));
  });

  it('rejects request form creation for a folder outside the authenticated tenant', async () => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    await expect(
      runAsTenantA(() =>
        service.createRequestForm({
          name: 'Cross tenant target',
          folderId: folderB,
          fields: [{ name: 'title', type: 'text', required: true }],
        }),
      ),
    ).rejects.toThrow(new NotFoundException('Folder not found'));
  });

  it('rejects malformed request form definitions before persistence', async () => {
    const database = new FakeDatabase(fixtures());
    const service = new CustomizationService(database.knex);

    await expect(
      runAsTenantA(() =>
        service.createRequestForm({
          name: 'Invalid form',
          folderId: folderA,
          fields: [
            { name: 'title', type: 'text', required: true },
            { name: 'title', type: 'textarea', required: false },
          ],
        }),
      ),
    ).rejects.toThrow(new BadRequestException('Field names must be unique'));
    expect(database.tables.request_forms).toHaveLength(2);
  });
});
