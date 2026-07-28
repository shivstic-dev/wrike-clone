import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Knex } from 'knex';
import PDFDocument from 'pdfkit';
import { strToU8, zipSync } from 'fflate';
import { DATABASE_PROVIDER } from '../database/database.module';
import { requireTenantContext } from '../common/tenant-context';
import { DepartmentAccessService } from '../rbac/department-access.service';
import type { DepartmentReportFilterInput } from '@wrike-clone/shared';
import {
  buildExactAudience,
  buildManagerAudience,
  buildUnrestrictedAudience,
  resolveReportMode,
  type ReportDepartmentMember,
  type ResolvedReportAudience,
} from './report-audience';

type ReportTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  visibility: string;
  department_name: string;
  assignee_name: string | null;
  start_date: Date | string | null;
  due_date: Date | string | null;
  completed_at: Date | string | null;
  created_at: Date | string;
};

export interface DepartmentReport {
  generatedAt: string;
  scope: {
    departmentId?: string;
    role: string;
    mode: 'self' | 'individual' | 'combined';
    ownTasksOnly: boolean;
  };
  filters: Record<string, string | undefined>;
  totals: {
    tasks: number;
    completed: number;
    overdue: number;
    averageCompletionHours: number | null;
  };
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  byAssignee: Array<{ assignee: string; total: number; completed: number; overdue: number }>;
  tasks: ReportTask[];
}

@Injectable()
export class ReportService {
  constructor(
    @Inject(DATABASE_PROVIDER) private readonly db: Knex,
    private readonly departmentAccess: DepartmentAccessService,
  ) {}

  async build(filter: DepartmentReportFilterInput): Promise<DepartmentReport> {
    const ctx = requireTenantContext();
    const scope = await this.resolveAudience(filter);
    const query = this.db('tasks')
      .join('workspaces', 'workspaces.id', 'tasks.department_id')
      .where('tasks.tenant_id', ctx.tenantId)
      .whereNull('tasks.deleted_at')
      .select(
        'tasks.id',
        'tasks.title',
        'tasks.status',
        'tasks.priority',
        'tasks.visibility',
        'workspaces.name as department_name',
        this.db.raw(`COALESCE(
          (
            SELECT string_agg(report_user.display_name, ', ' ORDER BY report_ta.is_primary DESC, report_user.display_name)
            FROM task_assignees report_ta
            JOIN users report_user ON report_user.id = report_ta.user_id
            WHERE report_ta.task_id = tasks.id
              AND report_ta.tenant_id = tasks.tenant_id
          ),
          (
            SELECT legacy_user.display_name
            FROM users legacy_user
            WHERE legacy_user.id = tasks.assignee_id
          )
        ) AS assignee_name`),
        'tasks.start_date',
        'tasks.due_date',
        'tasks.completed_at',
        'tasks.created_at',
      )
      .orderBy('tasks.due_date', 'asc')
      .orderBy('tasks.created_at', 'desc');

    if (scope.departmentId) query.where('tasks.department_id', scope.departmentId);
    if (scope.userIds) this.whereAssignedTo(query, scope.userIds);
    if (filter.dateFrom) query.where('tasks.created_at', '>=', filter.dateFrom);
    if (filter.dateTo) {
      const end = new Date(filter.dateTo);
      end.setHours(23, 59, 59, 999);
      query.where('tasks.created_at', '<=', end);
    }
    if (filter.status) query.where('tasks.status', filter.status);
    if (filter.priority) query.where('tasks.priority', filter.priority);
    if (filter.assigneeId) {
      await this.assertReportTargetAllowed(filter.assigneeId, scope.allowedTargetUserIds);
      this.whereAssignedTo(query, [filter.assigneeId]);
    }

    const tasks = (await query) as ReportTask[];
    const now = Date.now();
    const isOverdue = (task: ReportTask) =>
      !!task.due_date && new Date(task.due_date).getTime() < now && task.status !== 'completed';
    const completed = tasks.filter((task) => task.status === 'completed');
    const completionHours = completed
      .filter((task) => task.completed_at)
      .map(
        (task) =>
          (new Date(task.completed_at!).getTime() - new Date(task.created_at).getTime()) /
          3_600_000,
      )
      .filter((hours) => Number.isFinite(hours) && hours >= 0);

    const byStatus = this.countBy(tasks, (task) => task.status);
    const byPriority = this.countBy(tasks, (task) => task.priority);
    const assignees = new Map<string, { total: number; completed: number; overdue: number }>();
    for (const task of tasks) {
      const name = task.assignee_name || 'Unassigned';
      const current = assignees.get(name) || { total: 0, completed: 0, overdue: 0 };
      current.total += 1;
      if (task.status === 'completed') current.completed += 1;
      if (isOverdue(task)) current.overdue += 1;
      assignees.set(name, current);
    }

    return {
      generatedAt: new Date().toISOString(),
      scope: {
        departmentId: scope.departmentId,
        role: scope.role,
        mode: scope.mode,
        ownTasksOnly: scope.mode === 'self',
      },
      filters: {
        dateFrom: filter.dateFrom?.toISOString(),
        dateTo: filter.dateTo?.toISOString(),
        status: filter.status,
        priority: filter.priority,
        assigneeId: filter.assigneeId,
        scope: scope.mode,
        targetUserId: filter.targetUserId,
      },
      totals: {
        tasks: tasks.length,
        completed: completed.length,
        overdue: tasks.filter(isOverdue).length,
        averageCompletionHours:
          completionHours.length > 0
            ? Math.round(
                (completionHours.reduce((sum, value) => sum + value, 0) / completionHours.length) *
                  10,
              ) / 10
            : null,
      },
      byStatus,
      byPriority,
      byAssignee: [...assignees.entries()]
        .map(([assignee, values]) => ({ assignee, ...values }))
        .sort((a, b) => b.total - a.total),
      tasks,
    };
  }

  private whereAssignedTo(query: Knex.QueryBuilder, userIds: string[]): void {
    const ctx = requireTenantContext();
    query.andWhere((assigned) =>
      assigned.whereIn('tasks.assignee_id', userIds).orWhereExists(function () {
        this.select(1)
          .from('task_assignees as report_scope_ta')
          .whereRaw('report_scope_ta.task_id = tasks.id')
          .andWhere('report_scope_ta.tenant_id', ctx.tenantId)
          .whereIn('report_scope_ta.user_id', userIds);
      }),
    );
  }

  private async assertReportTargetAllowed(
    userId: string,
    allowedUserIds: string[] | null,
  ): Promise<void> {
    const ctx = requireTenantContext();
    if (allowedUserIds && !allowedUserIds.includes(userId)) {
      throw new ForbiddenException('That user is outside your report scope');
    }
    const member = await this.db('tenant_memberships')
      .where({ tenant_id: ctx.tenantId, user_id: userId, is_active: true })
      .first();
    if (!member) throw new ForbiddenException('That user is outside your organization');
  }

  private async resolveAudience(
    filter: DepartmentReportFilterInput,
  ): Promise<ResolvedReportAudience> {
    const ctx = requireTenantContext();
    const base = await this.departmentAccess.getReportScope(filter.departmentId);
    const mode = resolveReportMode(base.role, filter.scope);
    const role = base.role;

    if (role === 'employee' || mode === 'self') {
      return {
        departmentId: base.departmentId,
        role,
        mode,
        ...buildExactAudience(ctx.userId),
        allowedTargetUserIds: [ctx.userId],
      };
    }

    const departmentMembers = base.departmentId
      ? ((await this.db('workspace_members')
          .leftJoin('department_heads', function () {
            this.on('department_heads.department_id', '=', 'workspace_members.workspace_id').andOn(
              'department_heads.user_id',
              '=',
              'workspace_members.user_id',
            );
          })
          .join('tenant_memberships', function () {
            this.on('tenant_memberships.tenant_id', '=', 'workspace_members.tenant_id').andOn(
              'tenant_memberships.user_id',
              '=',
              'workspace_members.user_id',
            );
          })
          .where({
            'workspace_members.tenant_id': ctx.tenantId,
            'workspace_members.workspace_id': base.departmentId,
            'tenant_memberships.is_active': true,
          })
          .select(
            'workspace_members.user_id as userId',
            this.db.raw(`
              CASE
                WHEN department_heads.id IS NOT NULL THEN 'department_head'
                WHEN workspace_members.role = 'manager'
                  OR tenant_memberships.role = 'manager' THEN 'manager'
                ELSE 'employee'
              END AS role
            `),
            this.db.raw('(department_heads.id IS NOT NULL) AS "isDepartmentHead"'),
          )) as ReportDepartmentMember[])
      : [];

    const managerAudience =
      role === 'manager' ? buildManagerAudience(ctx.userId, departmentMembers) : null;
    const allowedUserIds = managerAudience
      ? managerAudience.userIds
      : base.departmentId
        ? departmentMembers.map((member) => member.userId)
        : null;

    if (mode === 'individual') {
      const target = filter.targetUserId!;
      await this.assertReportTargetAllowed(target, allowedUserIds);
      return {
        departmentId: base.departmentId,
        role,
        mode,
        ...buildExactAudience(target),
        allowedTargetUserIds: [target],
      };
    }

    const audience = managerAudience || buildUnrestrictedAudience();
    return {
      departmentId: base.departmentId,
      role,
      mode,
      ...audience,
      allowedTargetUserIds: allowedUserIds,
    };
  }

  async export(
    filter: DepartmentReportFilterInput & { format: 'pdf' | 'xlsx' },
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const report = await this.build(filter);
    const stamp = new Date().toISOString().slice(0, 10);
    if (filter.format === 'xlsx') {
      return {
        buffer: await this.toXlsx(report),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: `department-report-${stamp}.xlsx`,
      };
    }
    return {
      buffer: await this.toPdf(report),
      contentType: 'application/pdf',
      filename: `department-report-${stamp}.pdf`,
    };
  }

  private countBy(tasks: ReportTask[], key: (task: ReportTask) => string): Record<string, number> {
    return tasks.reduce<Record<string, number>>((result, task) => {
      const value = key(task);
      result[value] = (result[value] || 0) + 1;
      return result;
    }, {});
  }

  private async toXlsx(report: DepartmentReport): Promise<Buffer> {
    const summary = [
      ['Metric', 'Value'],
      ['Generated at', report.generatedAt],
      ['Total tasks', report.totals.tasks],
      ['Completed', report.totals.completed],
      ['Overdue', report.totals.overdue],
      ['Average completion hours', report.totals.averageCompletionHours ?? 'N/A'],
    ];
    const perUser = [
      ['Assignee', 'Total', 'Completed', 'Overdue'],
      ...report.byAssignee.map((item) => [item.assignee, item.total, item.completed, item.overdue]),
    ];
    const tasks = [
      [
        'Department',
        'Task',
        'Assignee',
        'Status',
        'Priority',
        'Visibility',
        'Start date',
        'Due date',
        'Completed at',
      ],
      ...report.tasks.map((task) => [
        task.department_name,
        task.title,
        task.assignee_name || 'Unassigned',
        task.status,
        task.priority,
        task.visibility,
        this.displayDate(task.start_date),
        this.displayDate(task.due_date),
        this.displayDate(task.completed_at),
      ]),
    ];

    const workbook = zipSync(
      {
        '[Content_Types].xml': strToU8(this.contentTypesXml()),
        '_rels/.rels': strToU8(this.rootRelationshipsXml()),
        'xl/workbook.xml': strToU8(this.workbookXml()),
        'xl/_rels/workbook.xml.rels': strToU8(this.workbookRelationshipsXml()),
        'xl/styles.xml': strToU8(this.stylesXml()),
        'xl/worksheets/sheet1.xml': strToU8(this.worksheetXml(summary)),
        'xl/worksheets/sheet2.xml': strToU8(this.worksheetXml(perUser)),
        'xl/worksheets/sheet3.xml': strToU8(this.worksheetXml(tasks)),
      },
      { level: 6 },
    );
    return Buffer.from(workbook);
  }

  private displayDate(value: Date | string | null): string {
    return value ? new Date(value).toISOString() : '';
  }

  private worksheetXml(rows: Array<Array<string | number>>): string {
    const body = rows
      .map(
        (row, rowIndex) =>
          `<row r="${rowIndex + 1}">${row
            .map((value, columnIndex) => {
              const reference = `${this.columnName(columnIndex + 1)}${rowIndex + 1}`;
              if (typeof value === 'number') {
                return `<c r="${reference}"${rowIndex === 0 ? ' s="1"' : ''}><v>${value}</v></c>`;
              }
              return `<c r="${reference}" t="inlineStr"${
                rowIndex === 0 ? ' s="1"' : ''
              }><is><t xml:space="preserve">${this.escapeXml(String(value))}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('');
    const lastColumn = this.columnName(Math.max(...rows.map((row) => row.length)));
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetData>${body}</sheetData>
  <autoFilter ref="A1:${lastColumn}1"/>
</worksheet>`;
  }

  private columnName(column: number): string {
    let value = column;
    let name = '';
    while (value > 0) {
      value -= 1;
      name = String.fromCharCode(65 + (value % 26)) + name;
      value = Math.floor(value / 26);
    }
    return name;
  }

  private escapeXml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&apos;');
  }

  private contentTypesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
  }

  private rootRelationshipsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  }

  private workbookXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Summary" sheetId="1" r:id="rId1"/>
    <sheet name="Per user" sheetId="2" r:id="rId2"/>
    <sheet name="Tasks" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`;
  }

  private workbookRelationshipsXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  }

  private stylesXml(): string {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font/><font><b/><color rgb="FFFFFFFF"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF4F46E5"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`;
  }

  private toPdf(report: DepartmentReport): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const document = new PDFDocument({ margin: 48, size: 'A4' });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolve(Buffer.concat(chunks)));

      document.fontSize(20).text('Department Task Report');
      document
        .moveDown(0.4)
        .fontSize(9)
        .fillColor('#64748b')
        .text(`Generated ${report.generatedAt}`);
      document.moveDown().fillColor('#0f172a').fontSize(12);
      document.text(`Total: ${report.totals.tasks}`);
      document.text(`Completed: ${report.totals.completed}`);
      document.text(`Overdue: ${report.totals.overdue}`);
      document.text(
        `Average completion: ${
          report.totals.averageCompletionHours === null
            ? 'N/A'
            : `${report.totals.averageCompletionHours} hours`
        }`,
      );

      document.moveDown().fontSize(14).text('Per-user summary');
      document.fontSize(9);
      for (const item of report.byAssignee) {
        document.text(
          `${item.assignee}: ${item.total} total, ${item.completed} completed, ${item.overdue} overdue`,
        );
      }

      document.moveDown().fontSize(14).text('Tasks');
      document.fontSize(8);
      for (const task of report.tasks) {
        if (document.y > 760) document.addPage();
        document
          .fillColor('#0f172a')
          .text(`${task.title} — ${task.status} / ${task.priority}`, { continued: false });
        document
          .fillColor('#64748b')
          .text(
            `${task.department_name} · ${task.assignee_name || 'Unassigned'} · due ${
              task.due_date ? new Date(task.due_date).toISOString().slice(0, 10) : 'not set'
            }`,
          );
      }
      document.end();
    });
  }
}
