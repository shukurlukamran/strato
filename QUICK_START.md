# 🚀 Quick Start Guide - Get Strato Live

Follow these steps to get your Strato game deployed and running!

## Prerequisites Checklist

- [ ] GitHub account (✅ Repository already created)
- [ ] Supabase account (create at https://supabase.com)
- [ ] Vercel account (create at https://vercel.com)

## Step 1: Create Supabase Project (5 minutes)

1. **Go to Supabase**: https://supabase.com/dashboard
2. **Click "New Project"**
3. **Fill in details**:
   - Name: `Strato`
   - Database Password: Choose a strong password (save it!)
   - Region: Choose closest to you
   - Plan: Free tier is fine
4. **Click "Create new project"** and wait 2-3 minutes

### Get Your Credentials

Once project is ready:

1. Go to **Settings** → **API**
2. Copy these values:
   - **Project URL** (looks like: `https://xxxxx.supabase.co`)
   - **anon public** key (under "Project API keys")
   - **service_role** key (under "Project API keys" - keep secret!)

3. **Get Project Reference ID**:
   - Look at your browser URL: `https://supabase.com/dashboard/project/[PROJECT_REF]`
   - Copy the `[PROJECT_REF]` part (looks like: `abcdefghijklmnop`)

## Step 2: Link Supabase and Push Schema

Run this command (replace `YOUR_PROJECT_REF` with your actual project ref):

```bash
cd /Users/kamranshukurlu/Documents/Strato/strato
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Or use the setup script:

```bash
npm run setup:supabase
```

## Step 3: Set Local Environment Variables

Create `.env.local` file:

```bash
cp env.local.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

## Step 4: Test Locally

```bash
npm run dev
```

Visit http://localhost:3000 - you should see the game!

## Step 5: Deploy to Vercel

1. **Go to Vercel**: https://vercel.com/new
2. **Import Git Repository**: Select `shukurlukamran/strato`
3. **Configure Project**:
   - Framework Preset: Next.js (auto-detected)
   - Root Directory: `./` (default)
4. **Add Environment Variables** (click "Environment Variables"):
   - `NEXT_PUBLIC_SUPABASE_URL` = your Supabase URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon key
   - `SUPABASE_SERVICE_ROLE_KEY` = your service role key
5. **Click "Deploy"**

Wait 1-2 minutes for deployment. Your app will be live!

## Step 6: Verify Everything Works

1. Visit your Vercel URL (e.g., `https://strato-xxx.vercel.app`)
2. Click "Start New Game"
3. Create a game and test the chat functionality

## Troubleshooting

### Supabase Connection Issues
- Verify your `.env.local` has correct values
- Check Supabase project is active (not paused)
- Ensure migrations ran successfully: `npx supabase db push`

### Vercel Build Fails
- Check environment variables are set correctly
- View build logs in Vercel dashboard
- Ensure all dependencies are in `package.json`

### Database Errors
- Run migrations again: `npx supabase db push`
- Check Supabase dashboard → Database → Tables (should see games, countries, etc.)

## Next Steps

Once deployed:
- [ ] Test creating a new game
- [ ] Test chat functionality
- [ ] Test deal proposals
- [ ] Set up custom domain (optional)
- [ ] Configure OpenAI API key for AI chat (optional)

## Need Help?

- Check `SUPABASE_SETUP.md` for detailed Supabase instructions
- Check `VERCEL_SETUP.md` for detailed Vercel instructions
- Check `README.md` for general project info
