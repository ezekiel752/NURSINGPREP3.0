import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const migrationsDir = path.resolve('supabase/migrations');
const target = process.argv[2] || 'exam';

function runTest(testFileName, minMigration) {
  const testPath = path.resolve('supabase/tests', testFileName);
  const tempPath = path.resolve('supabase/tests', `.temp_${testFileName}`);

  const migrationFiles = fs.readdirSync(migrationsDir)
    .filter((file) => file >= minMigration && file.endsWith('.sql'))
    .sort();

  let combinedMigrations = '';
  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    combinedMigrations += `-- Migration: ${file}\n${content}\n\n`;
  }

  const testSql = fs.readFileSync(testPath, 'utf8');
  const combinedSql = `begin;\n\n-- Migrations (from ${minMigration} onward)\n${combinedMigrations}\n-- Test Body\n${testSql}\n\nrollback;\n`;

  fs.writeFileSync(tempPath, combinedSql, 'utf8');

  try {
    const output = execSync(`npx supabase db query --remote --yes -f "${tempPath}"`, {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    console.log(`[PASS] ${testFileName}`);
    console.log(output);
  } catch (error) {
    console.error(`[FAIL] ${testFileName}`);
    if (error.stdout) console.log(error.stdout.toString());
    if (error.stderr) console.error(error.stderr.toString());
    throw error;
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

if (target === 'exam') {
  runTest('20261121000003_exam_test.sql', '20261121000004');
} else if (target === 'payments-grants') {
  runTest('20261121000007_payments_grants_test.sql', '20261121000007');
  const residueOutput = execSync(
    `npx supabase db query --remote --yes "select (select count(*)::int from public.payments where reference in ('ref-test-service-role-1', 'illegal-student-insert-ref')) as payments_residue, (select count(*)::int from auth.users where id = '11111111-1111-1111-1111-111111111111') as users_residue;"`,
    { encoding: 'utf8', stdio: 'pipe' }
  );
  console.log('RESIDUE CHECK:', residueOutput);
} else if (target === 'payments') {
  runTest('20261121000001_payments_test.sql', '20261121000004');
  runTest('20261121000007_payments_grants_test.sql', '20261121000007');
  const residueOutput = execSync(
    `npx supabase db query --remote --yes "select (select count(*)::int from public.payments where reference in ('ref-test-service-role-1', 'illegal-student-insert-ref', 'ref-test-student1-1', 'ref-test-student2-1')) as payments_residue, (select count(*)::int from auth.users where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')) as users_residue;"`,
    { encoding: 'utf8', stdio: 'pipe' }
  );
  console.log('RESIDUE CHECK:', residueOutput);
} else {
  runTest('20261121000003_exam_test.sql', '20261121000004');
}
