-- Create Test User and Workspace for Wrike Clone
-- Run this in Supabase SQL Editor

-- 1. Create a tenant (organization)
INSERT INTO tenants (id, slug, name, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'demo',
  'Demo Organization',
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Create a workspace
INSERT INTO workspaces (id, tenant_id, name, description, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'demo'),
  'Demo Workspace',
  'Test workspace for demo',
  NOW(),
  NOW()
);

-- 3. Create a test user (global, no tenant_id)
-- Password: Test123!
INSERT INTO users (id, email, password_hash, display_name, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'admin@demo.com',
  '$2b$12$LQ7glpeKWXH3V3xqQZ0EQOMxJGKxGX5VJdWqZ3.rD0mHqHqH3RFNy',
  'Demo Admin',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- 4. Link user to tenant
INSERT INTO tenant_memberships (id, tenant_id, user_id, role, joined_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'demo'),
  (SELECT id FROM users WHERE email = 'admin@demo.com'),
  'admin',
  NOW()
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 5. Add user to workspace as owner
INSERT INTO workspace_members (id, tenant_id, workspace_id, user_id, role, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  (SELECT id FROM tenants WHERE slug = 'demo'),
  (SELECT id FROM workspaces WHERE name = 'Demo Workspace' AND tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')),
  (SELECT id FROM users WHERE email = 'admin@demo.com'),
  'dept_admin',
  NOW(),
  NOW()
)
ON CONFLICT DO NOTHING;

-- Verify the setup
SELECT 'Tenant created:' as status, slug, name FROM tenants WHERE slug = 'demo'
UNION ALL
SELECT 'Workspace created:', name, description FROM workspaces WHERE name = 'Demo Workspace'
UNION ALL
SELECT 'User created:', email, display_name FROM users WHERE email = 'admin@demo.com';
