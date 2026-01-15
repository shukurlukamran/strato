# Supabase Setup Guide

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign in (or create an account)
2. Click "New Project"
3. Fill in:
   - **Name**: Strato
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose closest to you
   - **Pricing Plan**: Free tier is fine for now
4. Click "Create new project"
5. Wait 2-3 minutes for the project to be provisioned

## Step 2: Get Your Project Credentials

Once your project is ready:

1. Go to **Settings** → **API** in your Supabase dashboard
2. Copy these values (you'll need them):
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys" → "anon public")
   - **service_role** key (under "Project API keys" → "service_role" - keep this secret!)

## Step 3: Get Your Project Reference ID

1. In your Supabase dashboard, look at the URL: `https://supabase.com/dashboard/project/[PROJECT_REF]`
2. The `[PROJECT_REF]` is your project reference ID (looks like: `abcdefghijklmnop`)

## Step 4: Run the Setup Script

After you have your credentials, run:

```bash
# Link to your Supabase project (replace YOUR_PROJECT_REF with your actual project ref)
npx supabase link --project-ref YOUR_PROJECT_REF

# Push the database schema
npx supabase db push
```

## Step 5: Set Environment Variables

Create `.env.local` file:

```bash
cp env.local.example .env.local
```

Then edit `.env.local` and add:

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

## Step 6: Seed Initial Data (Optional)

To populate the database with initial test data:

```bash
npx supabase db reset
```

This will run migrations and seed data.
