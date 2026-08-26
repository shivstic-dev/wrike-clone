# Railway Deployment Guide

This guide will walk you through deploying the Wrike Clone backend to Railway.

## Prerequisites

- Railway account (sign up at https://railway.app)
- GitHub repository already set up (✓ Done: https://github.com/Shivstic-hell/wrike-clone.git)
- Supabase database (✓ Already configured)

## Step 1: Create a Railway Account

1. Go to https://railway.app
2. Click "Login" or "Start a New Project"
3. Sign in with your GitHub account (recommended)

## Step 2: Create a New Project

1. Click "New Project" in Railway dashboard
2. Select "Deploy from GitHub repo"
3. Choose your repository: `Shivstic-hell/wrike-clone`
4. Railway will detect it's a Node.js project

## Step 3: Configure the Service

Railway should auto-detect the monorepo. Configure these settings:

### Build Settings
- **Root Directory**: Leave as `/` (root)
- **Build Command**: `npm ci && npm run build -w @wrike-clone/shared && npm run build -w @wrike-clone/backend`
- **Start Command**: `bash scripts/railway-start.sh`

### Environment Variables

Add these environment variables in Railway (Settings → Variables):

```bash
NODE_ENV=production
PORT=4000

# Database (use your Supabase connection pooler)
DATABASE_URL=postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@POOLER_HOST:6543/postgres
DB_SSL=true
DB_MAX_CONNECTIONS=1
DB_IDLE_TIMEOUT_MS=1000
DB_APP_ROLE=openwork_app

# JWT Secrets (generate new ones for production!)
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production

# API Configuration
API_PREFIX=api/v1

# Public URLs
CORS_ORIGINS=https://wrike-clone-three.vercel.app
APP_PUBLIC_URL=https://wrike-clone-three.vercel.app
ALLOW_PUBLIC_REGISTRATION=false

# Private Supabase Storage (backend only)
SUPABASE_URL=https://lsjeobyrmxiqewehhjai.supabase.co
SUPABASE_SERVICE_ROLE_KEY=copy-from-supabase-project-api-settings
SUPABASE_STORAGE_BUCKET=work-management-files
```

**Important**: Generate strong secrets for JWT_SECRET and JWT_REFRESH_SECRET. Use:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 4: Deploy

1. Click "Deploy" in Railway
2. Railway will:
   - Clone your repository
   - Install dependencies
   - Build shared package
   - Build backend package
   - Start the server
3. Wait for deployment to complete (2-5 minutes)

## Step 5: Get Your Backend URL

1. Go to "Settings" tab in your Railway service
2. Click "Generate Domain" under "Networking"
3. You'll get a URL like: `https://your-app.up.railway.app`
4. Test it: `https://your-app.up.railway.app/api/v1/health`

## Step 6: Update CORS Settings

Once you have your Railway URL:

1. Keep only browser frontend origins in `CORS_ORIGINS`.
2. Production value: `https://wrike-clone-three.vercel.app`

## Monitoring and Logs

- **View Logs**: Click on your service → "Deployments" → Click the deployment → "View Logs"
- **Metrics**: Railway provides CPU, Memory, and Network usage metrics
- **Health Check**: Set Railway's health-check path to `/api/v1/health/ready`

## Troubleshooting

### Build Fails
- Check the build logs in Railway dashboard
- Ensure `railway.toml` is in the repository root
- Verify all dependencies are in package.json

### Database Connection Issues
- Ensure `DATABASE_URL` uses the Supabase **connection pooler** (port 6543)
- Check that Supabase allows connections from Railway IPs (usually auto-allowed)

### App Crashes on Start
- Check environment variables are set correctly
- View logs for error messages
- Ensure database migrations have been run

## Next Steps

1. Deploy frontend to Vercel (separate project)
2. Update frontend API URL to point to Railway backend
3. Set up custom domain (optional)
4. Configure monitoring and alerts

## Support

- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- GitHub Issues: https://github.com/Shivstic-hell/wrike-clone/issues
