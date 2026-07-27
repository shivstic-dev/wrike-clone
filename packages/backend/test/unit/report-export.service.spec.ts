import { unzipSync } from 'fflate';
import { ReportService, type DepartmentReport } from '../../src/reports/report.service';

const report: DepartmentReport = {
  generatedAt: '2026-07-27T12:00:00.000Z',
  scope: {
    departmentId: 'department-1',
    role: 'manager',
    mode: 'combined',
    ownTasksOnly: false,
  },
  filters: {},
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
});
