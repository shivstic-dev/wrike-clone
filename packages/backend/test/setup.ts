/**
 * Global test setup.
 * Sets environment variables and test helpers.
 */

process.env['NODE_ENV'] = 'test';
process.env['DB_HOST'] = 'localhost';
process.env['DB_PORT'] = '5432';
process.env['DB_NAME'] = 'wrike_clone_test';
process.env['DB_USER'] = 'wrike_test';
process.env['DB_PASSWORD'] = 'wrike_test';
process.env['JWT_SECRET'] = 'test-jwt-secret';
process.env['ENCRYPTION_KEY'] = 'test-key-change-in-prod';
process.env['LOG_LEVEL'] = 'silent';
