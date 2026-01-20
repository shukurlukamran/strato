/**
 * Simple script to apply the cities migration
 * Usage: node scripts/run-migration.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Load .env.local if it exists
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
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing Supabase credentials in .env.local');
  console.error('Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

console.log('🚀 Applying Cities Migration to Supabase\n');
console.log('📊 Checking if cities table exists...\n');

// Try to query the cities table
const url = new URL('/rest/v1/cities', SUPABASE_URL);
url.searchParams.append('select', 'count');
url.searchParams.append('limit', '1');

const protocol = SUPABASE_URL.startsWith('https') ? https : http;

const req = protocol.request(url, {
  method: 'GET',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
  },
}, (res) => {
  let data = '';
  
  res.on('data', chunk => {
    data += chunk;
  });
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Cities table already exists!');
      console.log('✅ Migration has already been applied.\n');
      process.exit(0);
    } else if (res.statusCode === 404 || data.includes('does not exist')) {
      console.log('⚠️  Cities table does not exist yet.');
      console.log('\n📋 Please apply the migration using one of these methods:\n');
      console.log('Method 1: Supabase Dashboard (Easiest)');
      console.log('  1. Go to: https://supabase.com/dashboard/project/<your-project>/sql');
      console.log('  2. Click "New Query"');
      console.log('  3. Copy and paste the contents of: supabase/migrations/004_add_cities.sql');
      console.log('  4. Click "Run"\n');
      console.log('Method 2: Supabase CLI');
      console.log('  npx supabase link --project-ref <your-project-ref>');
      console.log('  npx supabase db push\n');
      console.log('The migration SQL is ready in: supabase/migrations/004_add_cities.sql\n');
      process.exit(1);
    } else {
      console.log('❌ Unexpected response:', res.statusCode);
      console.log('Response:', data);
      process.exit(1);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
  process.exit(1);
});

req.end();
