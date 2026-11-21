import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const migrationsDir = path.resolve('supabase/migrations');
const testPath = path.resolve('supabase/tests/20261121000003_exam_test.sql');
const tempPath = path.resolve('supabase/tests/.temp_exam_test.sql');

// Concatenate all migrations from 20261121000004 onward in filename order
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter((file) => file >= '20261121000004' && file.endsWith('.sql'))
  .sort();

let combinedMigrations = '';
for (const file of migrationFiles) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  combinedMigrations += `-- Migration: ${file}\n${content}\n\n`;
}

const testSql = fs.readFileSync(testPath, 'utf8');

const combinedSql = `begin;\n\n-- Migrations (from 20261121000004 onward)\n${combinedMigrations}\n-- Exam Test Body\n${testSql}\n\nrollback;\n`;

fs.writeFileSync(tempPath, combinedSql, 'utf8');

try {
  const output = execSync(`npx supabase db query --remote --yes -f "${tempPath}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log(output);
} catch (error) {
  if (error.stdout) console.log(error.stdout.toString());
  if (error.stderr) console.error(error.stderr.toString());
  throw error;
} finally {
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}
