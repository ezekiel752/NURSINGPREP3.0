import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const migrationPath = path.resolve('supabase/migrations/20261121000001_payments.sql');
const testPath = path.resolve('supabase/tests/20261121000001_payments_test.sql');
const tempPath = path.resolve('supabase/tests/.temp_payments_test.sql');

const migrationSql = fs.readFileSync(migrationPath, 'utf8');
const testSql = fs.readFileSync(testPath, 'utf8');

const combinedSql = `begin;\n\n-- Migration (single source of truth)\n${migrationSql}\n\n-- Security Test Body\n${testSql}\n\nrollback;\n`;

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
