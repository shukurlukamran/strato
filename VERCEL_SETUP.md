# Vercel Deployment Setup

## Step 1: Import Repository to Vercel

1. Go to https://vercel.com and sign in (or create an account)
2. Click "Add New..." → "Project"
3. Import your GitHub repository: `shukurlukamran/strato`
4. Vercel will auto-detect Next.js settings

## Step 2: Configure Environment Variables

In the Vercel project settings, add these environment variables:

### Required Variables:

1. **NEXT_PUBLIC_SUPABASE_URL**
   - Value: Your Supabase project URL (from Supabase dashboard → Settings → API)

2. **NEXT_PUBLIC_SUPABASE_ANON_KEY**
   - Value: Your Supabase anon/public key (from Supabase dashboard → Settings → API)

3. **SUPABASE_SERVICE_ROLE_KEY**
   - Value: Your Supabase service_role key (from Supabase dashboard → Settings → API)
   - ⚠️ Keep this secret! It has admin access.

### Optional Variables (for future LLM integration):

4. **OPENAI_API_KEY** (optional, for AI chat)
   - Value: Your OpenAI API key (if you want to use GPT for AI country responses)

## Step 3: Deploy

1. Click "Deploy" button
2. Wait for the build to complete (usually 1-2 minutes)
3. Your app will be live at: `https://strato-[your-username].vercel.app`

## Step 4: Set Up Custom Domain (Optional)

1. Go to Project Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

## Automatic Deployments

- Every push to `main` branch will trigger a new deployment
- Pull requests will get preview deployments automatically

## Troubleshooting

### Build Fails
- Check that all environment variables are set correctly
- Check build logs in Vercel dashboard

### Database Connection Issues
- Verify Supabase URL and keys are correct
- Check Supabase project is active and not paused
- Ensure database migrations have been run

### Runtime Errors
- Check Vercel function logs
- Verify environment variables are accessible (they start with `NEXT_PUBLIC_` for client-side)
