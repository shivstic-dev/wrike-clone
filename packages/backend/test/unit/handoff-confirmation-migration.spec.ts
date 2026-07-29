import { readFileSync } from 'fs';
import { resolve } from 'path';

const sql = readFileSync(
  resolve(__dirname, '../../../../supabase/migrations/20260730100000_handoff_confirmation.sql'),
  'utf8',
);

describe('handoff confirmation migration', () => {
  it('adds the handoff state columns, completed-task backfill, and ready-task index', () => {
    expect(sql).toContain("handoff_status IN ('pending', 'ready', 'confirmed', 'not_required')");
    expect(sql).toContain('handoff_required BOOLEAN NOT NULL DEFAULT true');
    expect(sql).toContain('handoff_owner_id UUID');
    expect(sql).toContain('handoff_confirmed_by UUID');
    expect(sql).toContain('idx_tasks_tenant_handoff_ready');
    expect(sql).toMatch(/status = 'completed'[\s\S]*handoff_status = 'not_required'/);
  });
});
