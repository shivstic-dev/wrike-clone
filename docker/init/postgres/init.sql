-- ──────────────────────────────────────────────
-- Wrike Clone — PostgreSQL Initialization
-- Creates extensions and initial schema scaffolding
-- ──────────────────────────────────────────────
-- This script runs when the PostgreSQL container
-- starts for the first time. Schema migrations
-- are managed by Knex at application startup.
-- ──────────────────────────────────────────────

-- Required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "ltree";

-- Create the application schema
CREATE SCHEMA IF NOT EXISTS wrike;

-- Set search path for the application user
ALTER DATABASE wrike_clone SET search_path TO wrike, public;
