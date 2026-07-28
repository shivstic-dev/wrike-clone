import { clsx } from 'clsx';
import type { ReactNode } from 'react';
import { Panel } from './Panel';

export interface StatePanelProps {
  title: string;
  description: string;
  action?: ReactNode;
  tone?: 'empty' | 'error' | 'forbidden';
}

const toneClasses = {
  empty: 'border-dashed border-atlas-mist bg-white/75',
  error: 'border-atlas-blush bg-[#fff7f8]',
  forbidden: 'border-atlas-fieldNote bg-[#fffaf0]',
} as const;

export function StatePanel({ action, description, title, tone = 'empty' }: StatePanelProps) {
  return (
    <Panel
      className={clsx('flex flex-col items-center justify-center text-center', toneClasses[tone])}
      role={tone === 'error' ? 'alert' : undefined}
    >
      <h2 className="font-atlasDisplay text-lg font-bold text-atlas-ink">{title}</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Panel>
  );
}
