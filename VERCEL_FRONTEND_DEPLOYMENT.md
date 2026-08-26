# Vercel Frontend Deployment Guide

This guide will walk you through deploying the Wrike Clone frontend to Vercel.

## Prerequisites

- Vercel account (sign up at https://vercel.com)
- GitHub repository (✓ Done: https://github.com/shivstic-dev/wrike-clone.git)
- Backend deployed on Railway (✓ Done: https://wrike-clone-production.up.railway.app)

## Step 1: Create a Vercel Account

1. Go to https://vercel.com
2. Click "Sign Up"
3. Sign in with your GitHub account (recommended)
4. Authorize Vercel to access your GitHub repositories

## Step 2: Import Your Project

1. Click "Add New..." → "Project" in Vercel dashboard
2. Import your GitHub repository: `shivstic-dev/wrike-clone`
3. Vercel will detect it's a monorepo

## Step 3: Configure the Frontend Service

### Framework Preset
- Vercel should auto-detect **Vite**
- If not, manually select "Vite" from the dropdown

### Root Directory
- **IMPORTANT**: Set root directory to `packages/frontend`
- Click "Edit" next to "Root Directory"
- Enter: `packages/frontend`

### Build Settings
Vercel will auto-configure these (verify they match):
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Environment Variables

Click "Environment Variables" and add these:

| Name | Value |
|------|-------|
| `VITE_API_URL` | `https://wrike-clone-production.up.railway.app/api/v1` |
| `VITE_WS_URL` | `wss://wrike-clone-production.up.railway.app` |
| `VITE_APP_NAME` | `Wrike Clone` |
| `VITE_APP_VERSION` | `0.1.0` |

**Important**: Make sure to add these for all environments (Production, Preview, Development).

## Step 4: Deploy

1. Click "Deploy"
2. Vercel will:
   - Clone your repository
   - Install dependencies (including shared package)
   - Build the frontend
   - Deploy to global CDN
3. Wait for deployment to complete (2-4 minutes)

## Step 5: Get Your Frontend URL

1. After deployment, you'll get a URL like: `https://wrike-clone-xyz.vercel.app`
2. Test it in your browser
3. You should see the login/dashboard page

## Step 6: Update Backend CORS

Now that you have your frontend URL, add it to Railway backend:

1. Go to Railway dashboard: https://railway.app
2. Select your backend service
3. Go to "Variables" tab
4. Update `CORS_ORIGINS` to include your Vercel URL:
   ```
   https://wrike-clone-xyz.vercel.app,http://localhost:5173
   ```
5. Save changes (Railway will redeploy automatically)

## Step 7: Set Up Custom Domain (Optional)

1. In Vercel project settings → "Domains"
2. Add your custom domain (e.g., `app.yourdomain.com`)
3. Follow DNS configuration instructions
4. Update Railway CORS_ORIGINS with your custom domain

## Monitoring and Logs

- **View Logs**: Vercel dashboard → Your project → "Deployments" → Click deployment
- **Analytics**: Vercel provides page views and performance metrics
- **Preview Deployments**: Every git push gets a unique preview URL

## Automatic Deployments

Vercel automatically deploys:
- **Production**: Every push to `main` branch
- **Preview**: Every push to other branches or pull requests
- Each deployment gets a unique URL for testing

## Troubleshooting

### Build Fails with "Module not found"
- Ensure `packages/shared` is built first
- Check that dependencies are in `package.json`
- Vercel should auto-install workspace dependencies

### "Cannot connect to API"
- Verify `VITE_API_URL` is set correctly in Vercel environment variables
- Check Railway backend is running: https://wrike-clone-production.up.railway.app/api/v1/health
- Ensure CORS is configured on Railway backend

### Blank Page After Deploy
- Check browser console for errors
- Verify environment variables are set
- Check Vercel deployment logs for build errors

### 404 on Refresh
- This should be handled by `vercel.json` rewrites
- If not working, check that `vercel.json` is in `packages/frontend/`

## Cost

Vercel offers:
- **Free tier**: Generous limits for personal projects
  - 100GB bandwidth/month
  - Unlimited deployments
  - Automatic HTTPS
  - Global CDN
- **Pro tier**: $20/month (only if you need more)

## Testing Your Deployment

After deployment, test these:

1. ✅ Frontend loads: `https://your-app.vercel.app`
2. ✅ Can reach backend: Check Network tab → API calls to Railway
3. ✅ Login works (if you have test credentials)
4. ✅ WebSocket connection (if implemented)

## Next Steps

1. ✅ Frontend deployed on Vercel
2. ✅ Backend deployed on Railway
3. Update CORS settings on Railway
4. Create test workspace/user to verify full functionality
5. Set up custom domain (optional)
6. Configure monitoring and error tracking (optional: Sentry, LogRocket)

## Quick Commands for Local Testing

Before deploying, test locally with the Railway backend:

```bash
# In packages/frontend directory
cd packages/frontend

# Create .env file with Railway backend
echo "VITE_API_URL=https://wrike-clone-production.up.railway.app/api/v1" > .env
echo "VITE_WS_URL=wss://wrike-clone-production.up.railway.app" >> .env

# Install and run
npm install
npm run dev
```

Open http://localhost:5173 and verify it connects to Railway backend.

## Support

- Vercel Docs: https://vercel.com/docs
- Vercel Support: support@vercel.com
- GitHub Issues: https://github.com/shivstic-dev/wrike-clone/issues

---

## Summary

Your full stack is now deployed:
- **Backend**: Railway → https://wrike-clone-production.up.railway.app
- **Frontend**: Vercel → https://your-app.vercel.app
- **Database**: Supabase → PostgreSQL with connection pooler
