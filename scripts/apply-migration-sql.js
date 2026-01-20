/**
 * Apply migration SQL to Supabase using the Management API
 */
const fs = require('fs');
const path = require('path');

// Load .env.local
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing credentials');
  process.exit(1);
}

// Extract project ref from URL
const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
if (!projectRef) {
  console.error('❌ Could not extract project ref from URL');
  process.exit(1);
}

// Read migration SQL
const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '004_add_cities.sql');
const sql = fs.readFileSync(migrationPath, 'utf-8');

console.log('\n🚀 Applying Cities Migration via Supabase SQL API\n');
console.log(`Project: ${projectRef}`);
console.log(`SQL Length: ${sql.length} characters\n`);

// Use Supabase SQL endpoint
fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
  },
  body: JSON.stringify({ sql: sql }),
})
.then(res => {
  console.log('Response status:', res.status);
  return res.text().then(text => ({ status: res.status, body: text }));
})
.then(({ status, body }) => {
  if (status === 200 || status === 201) {
    console.log('✅ Migration applied successfully!');
  } else {
    console.log('Response body:', body);
    console.log('\n⚠️  SQL endpoint not available.');
    console.log('\nPlease apply the migration manually using one of these methods:\n');
    console.log('1. Supabase Dashboard SQL Editor:');
    console.log(`   https://supabase.com/dashboard/project/${projectRef}/sql/new`);
    console.log('   Copy/paste: supabase/migrations/004_add_cities.sql\n');
    console.log('2. Supabase CLI:');
    console.log('   npx supabase link --project-ref', projectRef);
    console.log('   npx supabase db push\n');
  }
})
.catch(err => {
  console.error('❌ Error:', err.message);
});
