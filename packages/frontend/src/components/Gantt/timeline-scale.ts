export type TimelineZoom = 'day' | 'week' | 'month';

export interface TimelineScaleInput {
  from: string;
  to: string;
  zoom: TimelineZoom;
}

export interface TimelineHeaderCell {
  label: string;
  width: number;
  start: string;
  end: string;
}

export interface TimelineScale {
  columnWidth: number;
  totalWidth: number;
  headerCells: TimelineHeaderCell[];
  dateToX(date: string): number;
  xToDate(x: number): string;
  snapDelta(px: number): number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WIDTHS: Record<TimelineZoom, number> = { day: 40, week: 14, month: 4 };

function utcDay(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) throw new RangeError(`Invalid timeline date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const time = Date.UTC(year, month, day);
  if (Number.isNaN(time)) throw new RangeError(`Invalid timeline date: ${value}`);
  return time;
}

function dateString(day: number): string {
  return new Date(day).toISOString().slice(0, 10);
}

function monthLabel(day: number): string {
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(day));
}

function headerCells(fromDay: number, toDay: number, zoom: TimelineZoom, width: number): TimelineHeaderCell[] {
  const cells: TimelineHeaderCell[] = [];
  if (zoom === 'day') {
    for (let day = fromDay; day <= toDay; day += DAY_MS) {
      cells.push({ label: dateString(day), width, start: dateString(day), end: dateString(day) });
    }
    return cells;
  }

  let start = fromDay;
  while (start <= toDay) {
    const current = new Date(start);
    const end = zoom === 'week'
      ? Math.min(toDay, start + (6 * DAY_MS))
      : Math.min(toDay, Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0));
    const days = ((end - start) / DAY_MS) + 1;
    cells.push({
      label: zoom === 'week' ? `Week of ${dateString(start)}` : monthLabel(start),
      width: zoom === 'month' ? Math.max(28, days * width) : days * width,
      start: dateString(start),
      end: dateString(end),
    });
    start = end + DAY_MS;
  }
  return cells;
}

/** A UTC-only timeline scale: calendar days never change width around DST. */
export function createTimelineScale({ from, to, zoom }: TimelineScaleInput): TimelineScale {
  const fromDay = utcDay(from);
  const toDay = utcDay(to);
  if (toDay < fromDay) throw new RangeError('Timeline end must be on or after its start');
  const columnWidth = WIDTHS[zoom];
  const dayCount = ((toDay - fromDay) / DAY_MS) + 1;
  return {
    columnWidth,
    totalWidth: dayCount * columnWidth,
    headerCells: headerCells(fromDay, toDay, zoom, columnWidth),
    dateToX: (date) => ((utcDay(date) - fromDay) / DAY_MS) * columnWidth,
    xToDate: (x) => dateString(fromDay + (Math.round(x / columnWidth) * DAY_MS)),
    snapDelta: (px) => Math.round(px / columnWidth) * columnWidth,
  };
}
