import { migrationFileConfig } from './knexfile';

describe('Knex migration file loading', () => {
  it('loads only TypeScript sources during development', () => {
    expect(migrationFileConfig('knexfile.ts')).toEqual({
      extension: 'ts',
      loadExtensions: ['.ts'],
    });
  });

  it('loads only JavaScript migrations from the compiled Railway build', () => {
    expect(migrationFileConfig('knexfile.js')).toEqual({
      extension: 'js',
      loadExtensions: ['.js'],
    });
  });

  it('does not allow declaration files in the compiled Railway build', () => {
    expect(migrationFileConfig('knexfile.js').loadExtensions).not.toContain('.ts');
  });
});
