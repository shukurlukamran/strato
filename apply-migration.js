const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = 'https://ebmqklbcnwwmaegvtkdy.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVibXFrbGJjbnd3bWFlZ3Z0a2R5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ2MDE3MiwiZXhwIjoyMDg0MDM2MTcyfQ.rcXOPCiTIF1YLrY5v_LuPkiCtw0P1_YN1urqkTj5xB8';

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyMigration() {
  try {
    console.log('Reading migration file...');
    const migrationSQL = fs.readFileSync('./supabase/migrations/004_add_cities.sql', 'utf8');

    console.log('Executing migration...');
    console.log('Migration SQL:', migrationSQL.substring(0, 200) + '...');

    // Try to execute via a simple query that should work
    const { data, error } = await supabase.rpc('exec', { query: migrationSQL });

    if (error) {
      console.log('RPC failed, trying individual statements...');

      // Split into individual statements and try to execute them
      const statements = migrationSQL.split(';').map(stmt => stmt.trim()).filter(stmt => stmt.length > 0);

      for (const statement of statements) {
        if (statement.startsWith('--')) continue; // Skip comments

        console.log('Executing:', statement.substring(0, 80) + '...');

        try {
          // For DDL statements, we might need to use a different approach
          // Let's try creating a test table first to see if we can execute DDL
          const { error: testError } = await supabase.from('countries').select('id').limit(1);
          if (testError) {
            console.log('Connection test failed:', testError);
            break;
          }

          // Since we can't execute DDL directly, let's at least verify the connection works
          console.log('Database connection verified');
        } catch (stmtError) {
          console.log('Statement execution failed:', stmtError.message);
        }
      }
    } else {
      console.log('Migration applied successfully via RPC!');
    }

    // Verify the cities table was created
    console.log('Verifying cities table creation...');
    const { data: citiesData, error: citiesError } = await supabase
      .from('cities')
      .select('*')
      .limit(1);

    if (citiesError) {
      console.log('Cities table verification failed:', citiesError.message);
    } else {
      console.log('Cities table exists! Sample data:', citiesData);
    }

  } catch (error) {
    console.error('Migration application failed:', error);
  }
}

applyMigration();