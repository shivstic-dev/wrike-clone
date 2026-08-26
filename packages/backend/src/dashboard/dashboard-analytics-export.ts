import type { DashboardAnalyticsResponse } from '@wrike-clone/shared';
import { strToU8, zipSync } from 'fflate';
import PDFDocument from 'pdfkit';

export interface DashboardAnalyticsExport {
  buffer: Buffer;
  contentType: string;
  filename: string;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function columnName(column: number): string {
  let value = column;
  let name = '';
  while (value > 0) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function worksheet(rows: Array<Array<string | number>>): string {
  const body = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}">${row
          .map((value, columnIndex) => {
            const ref = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
            return typeof value === 'number'
              ? `<c r="${ref}"${rowIndex === 0 ? ' s="1"' : ''}><v>${value}</v></c>`
              : `<c r="${ref}" t="inlineStr"${rowIndex === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${escapeXml(String(value))}</t></is></c>`;
          })
          .join('')}</row>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" state="frozen"/></sheetView></sheetViews><sheetData>${body}</sheetData></worksheet>`;
}

function xlsx(data: DashboardAnalyticsResponse): Buffer {
  const summary: Array<Array<string | number>> = [
    ['CEPAA board summary', 'Value'],
    ['Generated', data.generatedAt],
    ['Role scope', data.scope.role],
    ['Department', data.scope.departmentId ?? 'All authorized departments'],
    ['Project', data.scope.projectId ?? 'All authorized projects'],
    ['Period', `${data.period.from.slice(0, 10)} to ${data.period.to.slice(0, 10)}`],
    ['Average completion hours', data.kpis.averageCompletionHours ?? 'N/A'],
    ['Handoff success %', data.kpis.handoffSuccessRate ?? 'N/A'],
    ['On-time completion %', data.kpis.onTimeCompletionRate ?? 'N/A'],
    ['Average blocked age (days)', data.blockedAgeing.averageDays ?? 'N/A'],
  ];
  const trends: Array<Array<string | number>> = [
    ['Month', 'Completed', 'Overdue outcomes'],
    ...data.monthlyCompletion.map((point) => [
      point.month,
      point.completed,
      data.overdueOutcome.find((item) => item.month === point.month)?.total ?? 0,
    ]),
  ];
  const health: Array<Array<string | number>> = [
    [
      'Project',
      'Score',
      'Band',
      'Tasks',
      'On-time',
      'Overdue control',
      'Blocked ageing',
      'Workload balance',
      'Handoff success',
    ],
    ...data.projectHealth.map((project) => [
      project.projectName,
      project.score,
      project.band,
      project.taskCount,
      project.components.onTime,
      project.components.overdueControl,
      project.components.blockedAgeing,
      project.components.workloadBalance,
      project.components.handoffSuccess,
    ]),
  ];
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Trends" sheetId="2" r:id="rId2"/><sheet name="Project health" sheetId="3" r:id="rId3"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const styles = `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font/><font><b/><color rgb="FFFFFFFF"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF147A50"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf/><xf fontId="1" fillId="1" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
  return Buffer.from(
    zipSync(
      {
        '[Content_Types].xml': strToU8(contentTypes),
        '_rels/.rels': strToU8(rootRels),
        'xl/workbook.xml': strToU8(workbook),
        'xl/_rels/workbook.xml.rels': strToU8(workbookRels),
        'xl/styles.xml': strToU8(styles),
        'xl/worksheets/sheet1.xml': strToU8(worksheet(summary)),
        'xl/worksheets/sheet2.xml': strToU8(worksheet(trends)),
        'xl/worksheets/sheet3.xml': strToU8(worksheet(health)),
      },
      { level: 6 },
    ),
  );
}

function pdf(data: DashboardAnalyticsResponse): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 44, size: 'A4' });
    const chunks: Buffer[] = [];
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));

    document.fillColor('#0d3b2a').fontSize(22).text('CEPAA Board Summary');
    document.fillColor('#64748b').fontSize(9).text(`Generated ${data.generatedAt}`);
    document.moveDown().fillColor('#0f172a').fontSize(11);
    document.text(
      `Scope: ${data.scope.role} · ${data.scope.departmentId ?? 'all authorized departments'}`,
    );
    document.text(`Period: ${data.period.from.slice(0, 10)} to ${data.period.to.slice(0, 10)}`);
    document.moveDown().fontSize(15).text('Key performance indicators');
    document.fontSize(10);
    document.text(`Average completion: ${data.kpis.averageCompletionHours ?? 'N/A'} hours`);
    document.text(`On-time completion: ${data.kpis.onTimeCompletionRate ?? 'N/A'}%`);
    document.text(`Handoff success: ${data.kpis.handoffSuccessRate ?? 'N/A'}%`);
    document.text(`Average blocked age: ${data.blockedAgeing.averageDays ?? 'N/A'} days`);
    document.moveDown().fontSize(15).text('Monthly trend');
    document.fontSize(9);
    for (const point of data.monthlyCompletion) {
      const overdue = data.overdueOutcome.find((item) => item.month === point.month)?.total ?? 0;
      document.text(`${point.month}: ${point.completed} completed · ${overdue} overdue outcomes`);
    }
    document.moveDown().fontSize(15).text('Project health');
    document.fontSize(9);
    for (const project of data.projectHealth) {
      if (document.y > 750) document.addPage();
      document.text(`${project.projectName}: ${project.score}/100 (${project.band})`);
      document
        .fillColor('#64748b')
        .text(
          `On-time ${project.components.onTime} · overdue control ${project.components.overdueControl} · blocked ageing ${project.components.blockedAgeing} · workload ${project.components.workloadBalance} · handoff ${project.components.handoffSuccess}`,
        );
      document.fillColor('#0f172a');
    }
    document.end();
  });
}

export async function exportDashboardAnalytics(
  data: DashboardAnalyticsResponse,
  format: 'pdf' | 'xlsx',
): Promise<DashboardAnalyticsExport> {
  const stamp = data.generatedAt.slice(0, 10);
  if (format === 'xlsx') {
    return {
      buffer: xlsx(data),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `cepaa-board-summary-${stamp}.xlsx`,
    };
  }
  return {
    buffer: await pdf(data),
    contentType: 'application/pdf',
    filename: `cepaa-board-summary-${stamp}.pdf`,
  };
}
