import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const migrationsDir = path.resolve('supabase/migrations');
const testPath = path.resolve('supabase/tests/20261121000003_exam_test.sql');
const tempPath = path.resolve('supabase/tests/.temp_exam_test.sql');

// Concatenate all migrations from 20261121000005 onward in filename order
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter((file) => file >= '20261121000005' && file.endsWith('.sql'))
  .sort();

let combinedMigrations = '';
for (const file of migrationFiles) {
  const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  combinedMigrations += `-- Migration: ${file}\n${content}\n\n`;
}

const testSql = fs.readFileSync(testPath, 'utf8');

const combinedSql = `begin;\n\n-- Migrations (from 20261121000005 onward)\n${combinedMigrations}\n-- Exam Test Body\n${testSql}\n\nrollback;\n`;

fs.writeFileSync(tempPath, combinedSql, 'utf8');

try {
  const output = execSync(`npx supabase db query --remote --yes -f "${tempPath}"`, {
    encoding: 'utf8',
    stdio: 'pipe',
  });
  console.log(output);

  // Residue check after rolled-back transaction
  const residueOutput = execSync(
    `npx supabase db query --remote --yes "select (select count(*) from auth.users where id in ('33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444')) as users_residue, (select count(*) from public.exam_attempts where id in ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666', '77777777-7777-7777-7777-777777777777', '88888888-8888-8888-8888-888888888888', '99999999-9999-9999-9999-999999999999')) as attempts_residue;"`,
    {
      encoding: 'utf8',
      stdio: 'pipe',
    }
  );
  console.log('RESIDUE CHECK:', residueOutput);
} catch (error) {
  if (error.stdout) console.log(error.stdout.toString());
  if (error.stderr) console.error(error.stderr.toString());
  throw error;
} finally {
  if (fs.existsSync(tempPath)) {
    fs.unlinkSync(tempPath);
  }
}
