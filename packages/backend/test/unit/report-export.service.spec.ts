import { unzipSync } from 'fflate';
import { inflateSync } from 'node:zlib';
import { ReportService, type DepartmentReport } from '../../src/reports/report.service';

function extractPdfText(buffer: Buffer): string {
  const source = buffer.toString('latin1');
  const streams = [...source.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)].map((match) => {
    const bytes = Buffer.from(match[1]!, 'latin1');
    try {
      return inflateSync(bytes).toString('latin1');
    } catch {
      return match[1];
    }
  });

  return streams
    .join('\n')
    .replaceAll(/<([0-9a-f]+)>/gi, (_match, hex: string) =>
      Buffer.from(hex, 'hex').toString('latin1'),
    );
}

const report: DepartmentReport = {
  generatedAt: '2026-07-27T12:00:00.000Z',
  scope: {
    departmentId: 'department-1',
    role: 'manager',
    mode: 'combined',
    ownTasksOnly: false,
  },
  filters: {
    dateFrom: '2026-07-01T00:00:00.000Z',
    dateTo: '2026-07-27T23:59:59.999Z',
    status: 'todo',
    priority: 'critical',
    assigneeId: 'user-1',
  },
  totals: { tasks: 1, completed: 0, overdue: 1, averageCompletionHours: null },
  byStatus: { todo: 1 },
  byPriority: { critical: 1 },
  byAssignee: [{ assignee: 'Alex', total: 1, completed: 0, overdue: 1 }],
  tasks: [
    {
      id: 'task-1',
      title: 'Launch <critical> & review',
      status: 'todo',
      priority: 'critical',
      visibility: 'department',
      department_name: 'Operations',
      assignee_name: 'Alex',
      start_date: null,
      due_date: '2026-07-26T12:00:00.000Z',
      completed_at: null,
      created_at: '2026-07-20T12:00:00.000Z',
    },
  ],
};

describe('ReportService exports', () => {
  const service = new ReportService({} as never, {} as never);

  it('creates a native XLSX package with three worksheets', async () => {
    const buffer = await (service as any).toXlsx(report);
    expect(buffer.subarray(0, 2).toString()).toBe('PK');
    const files = unzipSync(buffer);
    expect(files['xl/worksheets/sheet1.xml']).toBeDefined();
    expect(files['xl/worksheets/sheet2.xml']).toBeDefined();
    expect(files['xl/worksheets/sheet3.xml']).toBeDefined();
    expect(new TextDecoder().decode(files['xl/worksheets/sheet3.xml'])).toContain(
      'Launch &lt;critical&gt; &amp; review',
    );
  });

  it('creates a valid PDF byte stream', async () => {
    const buffer = await (service as any).toPdf(report);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeGreaterThan(500);
  });

  it('writes the resolved scope and filters into PDF content', async () => {
    const buffer = await (service as any).toPdf(report);
    const content = extractPdfText(buffer);

    expect(content).toContain('Scope:');
    expect(content).toContain('combined');
    expect(content).toContain('Status filter:');
    expect(content).toContain('todo');
  });

  it('writes the resolved scope and filters into XLSX summary', async () => {
    const buffer = await (service as any).toXlsx(report);
    const files = unzipSync(buffer);
    const summary = new TextDecoder().decode(files['xl/worksheets/sheet1.xml']);

    expect(summary).toContain('Scope');
    expect(summary).toContain('combined');
    expect(summary).toContain('Role');
    expect(summary).toContain('manager');
    expect(summary).toContain('Department');
    expect(summary).toContain('department-1');
    expect(summary).toContain('Created from');
    expect(summary).toContain('2026-07-01T00:00:00.000Z');
    expect(summary).toContain('Created to');
    expect(summary).toContain('2026-07-27T23:59:59.999Z');
    expect(summary).toContain('Status filter');
    expect(summary).toContain('todo');
    expect(summary).toContain('Priority filter');
    expect(summary).toContain('critical');
    expect(summary).toContain('Assignee filter');
    expect(summary).toContain('user-1');
  });

  it('exports every task row from the report object', async () => {
    const buffer = await (service as any).toXlsx(report);
    const tasks = new TextDecoder().decode(unzipSync(buffer)['xl/worksheets/sheet3.xml']);

    for (const task of report.tasks) {
      expect(tasks).toContain(
        task.title.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
      );
    }
  });
});
