/**
 * Script to apply the cities migration to Supabase
 * Run this with: npx tsx scripts/apply-cities-migration.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

async function applyMigration() {
  console.log('🚀 Applying Cities Migration to Supabase...\n');

  // Load environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('❌ Error: Missing Supabase credentials');
    console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  // Create Supabase client with service role key (needed for schema changes)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  try {
    // Read the migration SQL file
    const migrationPath = join(__dirname, '..', 'supabase', 'migrations', '004_add_cities.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Migration file loaded');
    console.log('📊 Executing SQL...\n');

    // Execute the migration
    // Note: Supabase client doesn't support executing raw SQL directly from client
    // We need to use the REST API or rpc function
    
    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`Found ${statements.length} SQL statements to execute\n`);

    // Try using Supabase's SQL editor API endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({ query: migrationSQL }),
    });

    if (!response.ok) {
      // If the RPC endpoint doesn't exist, we need to use Supabase CLI or dashboard
      console.log('⚠️  Cannot execute SQL directly through Supabase client');
      console.log('');
      console.log('Please apply the migration using one of these methods:');
      console.log('');
      console.log('Method 1: Supabase CLI (Recommended)');
      console.log('  npx supabase db push');
      console.log('');
      console.log('Method 2: Supabase Dashboard');
      console.log('  1. Go to your Supabase project dashboard');
      console.log('  2. Navigate to SQL Editor');
      console.log('  3. Paste the contents of supabase/migrations/004_add_cities.sql');
      console.log('  4. Click "Run"');
      console.log('');
      console.log('Method 3: Direct Database Connection');
      console.log('  psql <connection_string> -f supabase/migrations/004_add_cities.sql');
      console.log('');
      
      // At least verify we can connect to Supabase
      const { data, error } = await supabase.from('games').select('count').limit(1);
      if (error) {
        console.log('❌ Connection test failed:', error.message);
      } else {
        console.log('✅ Connection to Supabase verified');
      }
      
      process.exit(1);
    }

    console.log('✅ Migration applied successfully!\n');
    
    // Verify the table was created
    const { error } = await supabase.from('cities').select('count').limit(1);
    
    if (error) {
      console.log('⚠️  Table verification failed:', error.message);
      console.log('The migration may have run, but verification failed.');
    } else {
      console.log('✅ Cities table verified - ready to use!\n');
    }

  } catch (error) {
    console.error('❌ Error applying migration:', error);
    process.exit(1);
  }
}

// Run the migration
applyMigration().catch(console.error);
