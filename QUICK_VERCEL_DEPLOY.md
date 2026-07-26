# Quick Vercel Deployment Steps

Follow these steps to deploy your frontend to Vercel in under 5 minutes:

## Step 1: Go to Vercel
1. Open https://vercel.com
2. Sign in with GitHub
3. Click "Add New..." → "Project"

## Step 2: Import Repository
1. Find and select: `shivstic-dev/wrike-clone`
2. Click "Import"

## Step 3: Configure Project

### Root Directory (IMPORTANT!)
- Click "Edit" next to Root Directory
- Enter: `packages/frontend`
- This tells Vercel to deploy only the frontend folder

### Framework
- Should auto-detect as "Vite"
- If not, select "Vite" from dropdown

### Environment Variables
Click "Environment Variables" and add these 4 variables:

```
VITE_API_URL=https://wrike-clone-production.up.railway.app/api/v1
VITE_WS_URL=wss://wrike-clone-production.up.railway.app
VITE_APP_NAME=Wrike Clone
VITE_APP_VERSION=0.1.0
```

**Make sure to select "Production", "Preview", and "Development" for all variables**

## Step 4: Deploy
1. Click "Deploy"
2. Wait 2-4 minutes
3. You'll get a URL like: `https://wrike-clone-abc123.vercel.app`

## Step 5: Update Backend CORS
1. Go to Railway: https://railway.app
2. Open your backend service
3. Go to "Variables" tab
4. Update `CORS_ORIGINS` to:
   ```
   https://your-vercel-url.vercel.app,http://localhost:5173
   ```
   (Replace `your-vercel-url` with your actual Vercel URL)
5. Save (Railway auto-redeploys)

## Step 6: Test
1. Open your Vercel URL in browser
2. You should see the Wrike Clone login page
3. Try logging in (if you have test credentials)

---

## That's it! 🎉

Your full stack app is now live:
- ✅ **Frontend**: Vercel (your new URL)
- ✅ **Backend**: Railway (https://wrike-clone-production.up.railway.app)
- ✅ **Database**: Supabase

## Troubleshooting

**"Cannot connect to API"**
- Check VITE_API_URL is correct in Vercel
- Verify Railway backend is running: https://wrike-clone-production.up.railway.app/api/v1/health
- Make sure CORS is updated on Railway with your Vercel URL

**Blank page**
- Check browser console (F12) for errors
- Verify environment variables are set in Vercel

**Need help?**
- Read full guide: `VERCEL_FRONTEND_DEPLOYMENT.md`
