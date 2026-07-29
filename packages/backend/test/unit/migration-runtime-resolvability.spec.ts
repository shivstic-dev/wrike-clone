import { existsSync, readdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

const repositoryRoot = resolve(__dirname, '../../../..');
const sourceMigrationRoot = resolve(repositoryRoot, 'packages/backend/src/migrations');
const compiledMigrationRoot = resolve(repositoryRoot, 'packages/backend/dist/migrations');

const migrationSources = readdirSync(sourceMigrationRoot)
  .filter((filename) => /^\d{3}_.+\.ts$/u.test(filename))
  .sort();

describe('Knex migration runtime dependencies', () => {
  it.each(migrationSources)('%s exports Knex up and down functions', (filename) => {
    const migration = require(resolve(sourceMigrationRoot, filename)) as {
      up?: unknown;
      down?: unknown;
    };

    expect(typeof migration.up).toBe('function');
    expect(typeof migration.down).toBe('function');
  });

  it.each(migrationSources)(
    '%s has every external SQL dependency available to source and compiled runtimes',
    (filename) => {
      const source = readFileSync(resolve(sourceMigrationRoot, filename), 'utf8');
      const relativeSqlPaths = Array.from(
        source.matchAll(/['"](\.\.\/\.\.\/\.\.\/\.\.\/supabase\/migrations\/[^'"]+\.sql)['"]/gu),
        (match) => match[1]!,
      );

      for (const relativeSqlPath of relativeSqlPaths) {
        const sourceResolvedPath = resolve(sourceMigrationRoot, relativeSqlPath);
        const compiledResolvedPath = resolve(compiledMigrationRoot, relativeSqlPath);

        expect(existsSync(sourceResolvedPath)).toBe(true);
        expect(compiledResolvedPath).toBe(sourceResolvedPath);
      }
    },
  );

  it('loads the search and hot-path parity migration as a self-contained module', () => {
    const migrationPath = resolve(
      sourceMigrationRoot,
      '019_search_and_hot_path_indexes.ts',
    );

    expect(() => require(migrationPath)).not.toThrow();
  });
});
