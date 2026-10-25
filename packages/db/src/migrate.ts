import { resolve } from 'node:path';
import { runMigrations } from './migrations';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is not set; cannot run migrations.');
  process.exit(1);
}

const migrationsFolder =
  process.env.MIGRATIONS_FOLDER ||
  resolve(import.meta.dirname, '../migrations');

try {
  await runMigrations(connectionString, migrationsFolder);
  console.log(`Migrations applied from ${migrationsFolder}`);
  process.exit(0);
} catch (error) {
  console.error('Migration failed:', error);
  process.exit(1);
}
