/**
 * ──────────────────────────────────────────────
 * Wrike Clone — Database Seed Script (v2)
 * Creates a tenant, admin user, workspace,
 * folders, projects, and sample tasks.
 * ──────────────────────────────────────────────
 *
 * Usage: npx ts-node scripts/seed.ts
 */

import knex, { Knex } from 'knex';
import { hash } from 'bcryptjs';

const SALT_ROUNDS = 12;

// ── Configuration ─────────────────────────────
const DB_CONFIG: Knex.Config = {
  client: 'pg',
  connection: process.env['DATABASE_URL']
    ? { connectionString: process.env['DATABASE_URL'] }
    : {
        host: process.env['DB_HOST'] || 'localhost',
        port: Number(process.env['DB_PORT']) || 5432,
        database: process.env['DB_NAME'] || 'wrike_clone',
        user: process.env['DB_USER'] || 'wrike',
        password: process.env['DB_PASSWORD'] || 'wrike_dev',
      },
  pool: { min: 1, max: 2 },
};

async function seed(): Promise<void> {
  const db = knex(DB_CONFIG);
  const passwordHash = await hash('password123', SALT_ROUNDS);

  try {
    console.log('[seed] Starting database seed...\n');

    // ── 1. Tenant ──────────────────────────────
    const [tenant] = await db('tenants')
      .insert({
        name: 'Acme Corp',
        slug: 'acme-corp',
        domain: 'acme.com',
        plan_tier: 'free',
        settings: JSON.stringify({
          defaultTimezone: 'UTC',
          defaultLocale: 'en',
          maxUsers: 100,
          maxStorageGb: 10,
          allowedAuthProviders: ['local'],
          enforceSso: false,
          sessionTimeoutMinutes: 480,
        }),
      })
      .returning('*');

    console.log(`[OK] Tenant: ${tenant.name} (${tenant.id})`);

    // ── 2. Admin User ──────────────────────────
    const [adminUser] = await db('users')
      .insert({
        email: 'admin@acme.com',
        display_name: 'Admin User',
        password_hash: passwordHash,
        must_change_password: true,
      })
      .returning('*');

    console.log(`[OK] Admin user: admin@acme.com / password123 (must change on first login)`);

    // ── 3. Tenant Membership ───────────────────
    const [membership] = await db('tenant_memberships')
      .insert({
        tenant_id: tenant.id,
        user_id: adminUser.id,
        role: 'admin',
      })
      .returning('*');

    // ── 4. Workspaces (Departments) ────────────
    const workspaces = await db('workspaces')
      .insert([
        {
          tenant_id: tenant.id,
          name: 'Engineering',
          description: 'Software development and platform engineering',
          sort_order: 0,
        },
        {
          tenant_id: tenant.id,
          name: 'Marketing',
          description: 'Marketing campaigns, content, and brand',
          sort_order: 1,
        },
        {
          tenant_id: tenant.id,
          name: 'Operations',
          description: 'Business operations and HR',
          sort_order: 2,
        },
      ])
      .returning('*');

    console.log(`[OK] Workspaces: ${workspaces.length} created`);

    // ── 5. Workspace Members ────────────────────
    // Make admin a dept_admin of all workspaces
    for (const ws of workspaces) {
      await db('workspace_members').insert({
        tenant_id: tenant.id,
        workspace_id: ws.id,
        user_id: adminUser.id,
        role: 'dept_admin',
      });
    }

    console.log(`[OK] Admin added to all workspaces as dept_admin`);

    // ── 6. Folders ─────────────────────────────
    const engWorkspace = workspaces[0];
    const folders = await db('folders')
      .insert([
        {
          tenant_id: tenant.id,
          workspace_id: engWorkspace.id,
          name: 'Product Development',
          description: 'Feature development and releases',
          sort_order: 0,
        },
        {
          tenant_id: tenant.id,
          workspace_id: engWorkspace.id,
          name: 'Infrastructure',
          description: 'DevOps, CI/CD, and platform',
          sort_order: 1,
        },
      ])
      .returning('*');

    console.log(`[OK] Folders: ${folders.length} created`);

    // ── 7. Projects ────────────────────────────
    const devFolder = folders[0];
    const projects = await db('projects')
      .insert([
        {
          tenant_id: tenant.id,
          folder_id: devFolder.id,
          owner_id: adminUser.id,
          name: 'Q4 Platform Release',
          description: 'Major platform update with new features',
          status: 'active',
          priority: 'high',
          visibility: 'organization',
          start_date: new Date(),
          due_date: new Date(Date.now() + 90 * 86400000),
        },
        {
          tenant_id: tenant.id,
          folder_id: devFolder.id,
          owner_id: adminUser.id,
          name: 'Internal Tools',
          description: 'Engineering productivity tools',
          status: 'active',
          priority: 'medium',
          visibility: 'department',
          start_date: new Date(),
          due_date: new Date(Date.now() + 60 * 86400000),
        },
      ])
      .returning('*');

    console.log(`[OK] Projects: ${projects.length} created`);

    // ── 8. Tasks ───────────────────────────────
    const platformProject = projects[0];
    const toolsProject = projects[1];

    await db('tasks').insert([
      {
        tenant_id: tenant.id,
        project_id: platformProject.id,
        created_by_id: adminUser.id,
        assignee_id: adminUser.id,
        title: 'Set up CI/CD pipeline',
        description: 'Configure GitHub Actions for automated testing and deployment',
        status: 'in_progress',
        priority: 'high',
        visibility: 'organization',
        estimated_hours: 16,
        due_date: new Date(Date.now() + 14 * 86400000),
      },
      {
        tenant_id: tenant.id,
        project_id: platformProject.id,
        created_by_id: adminUser.id,
        title: 'Design dashboard wireframes',
        description: 'Create wireframes for the new dashboard',
        status: 'todo',
        priority: 'medium',
        visibility: 'organization',
        estimated_hours: 8,
        due_date: new Date(Date.now() + 21 * 86400000),
      },
      {
        tenant_id: tenant.id,
        project_id: toolsProject.id,
        created_by_id: adminUser.id,
        assignee_id: adminUser.id,
        title: 'Build internal reporting tool',
        description: 'Create a reporting dashboard for engineering metrics',
        status: 'backlog',
        priority: 'low',
        visibility: 'department',
        estimated_hours: 24,
        due_date: new Date(Date.now() + 45 * 86400000),
      },
    ]);

    console.log(`[OK] Tasks: 3 created`);

    // ── Summary ───────────────────────────────
    console.log('\n==========================================');
    console.log('  Seed Complete!');
    console.log('==========================================');
    console.log(`  Tenant:      Acme Corp (${tenant.slug})`);
    console.log(`  Admin:       admin@acme.com / password123`);
    console.log(`              (must change password on first login)`);
    console.log(`  Workspaces:  ${workspaces.map((w: any) => w.name).join(', ')}`);
    console.log(`  Folders:     ${folders.length}`);
    console.log(`  Projects:    ${projects.length}`);
    console.log(`  Tasks:       3`);
    console.log('==========================================\n');

  } catch (error) {
    console.error('[seed] Error:', error);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

seed();
