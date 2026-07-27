# Render Deployment Guide

Deploy the Wrike Clone backend to Render in minutes.

## Prerequisites

- Render account (sign up at https://render.com)
- GitHub repository (✓ Done: https://github.com/Shivstic-hell/wrike-clone.git)
- Supabase database (✓ Already configured)

## Step 1: Create a Render Account

1. Go to https://render.com
2. Click "Get Started" or "Sign Up"
3. Sign up with your GitHub account (recommended)

## Step 2: Create a New Web Service

1. Click "New +" in the Render dashboard
2. Select "Web Service"
3. Connect your GitHub account if not already connected
4. Select your repository: `Shivstic-hell/wrike-clone`
5. Click "Connect"

## Step 3: Configure the Service

Fill in these settings:

### Basic Settings
- **Name**: `wrike-clone-backend` (or any name you prefer)
- **Region**: Choose closest to you or `Singapore` (closest to your Supabase)
- **Branch**: `main`
- **Root Directory**: Leave empty (uses repository root)
- **Runtime**: `Node`

### Build & Deploy Settings
- **Build Command**: 
  ```bash
  npm install && npm run build -w @wrike-clone/shared && npm run build -w @wrike-clone/backend
  ```

- **Start Command**:
  ```bash
  cd packages/backend && npm run start:prod
  ```

### Plan
- Select **Free** (plenty for development/testing)

## Step 4: Add Environment Variables

Click "Advanced" and add these environment variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `API_PREFIX` | `api/v1` |
| `DATABASE_URL` | `postgresql://postgres.qmzxjfirlppveoxkynbt:*Cankidskidscan393@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres` |
| `JWT_SECRET` | Generate a unique 32-byte secret for this environment |
| `JWT_REFRESH_SECRET` | Generate a different unique 32-byte secret |
| `CORS_ORIGINS` | `*` |

**Note**: You can generate new JWT secrets by running:
```bash
node generate-secrets.js
```

## Step 5: Deploy

1. Click "Create Web Service" at the bottom
2. Render will:
   - Clone your repository
   - Install dependencies
   - Build shared and backend packages
   - Start your server
3. Wait for deployment (3-7 minutes for first deploy)

## Step 6: Get Your Backend URL

Once deployed, you'll get a URL like:
```
https://wrike-clone-backend.onrender.com
```

Test it:
```
https://wrike-clone-backend.onrender.com/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

## Step 7: Configure Health Check (Optional but Recommended)

Render automatically monitors your service:

1. Go to your service → Settings
2. Under "Health & Alerts"
3. **Health Check Path**: `/api/v1/health`
4. Render will ping this every 5 minutes to keep your app alive

## Monitoring and Logs

- **View Logs**: Click "Logs" tab in your service dashboard
- **Metrics**: View CPU, Memory usage in the "Metrics" tab
- **Events**: Track deployments and restarts in "Events" tab

## Render Free Tier Limits

- ✅ **750 hours/month** (enough for 24/7 uptime)
- ✅ **512 MB RAM**
- ✅ **Automatic HTTPS**
- ⚠️ **Spins down after 15 min of inactivity** (first request after will be slow ~30s)
- ⚠️ **No custom domains on free tier** (can upgrade to $7/month)

### Preventing Sleep (Optional)

To keep your service always awake on free tier, use a service like:
- **UptimeRobot** (free): Pings your health endpoint every 5 minutes
- **Cron-job.org** (free): Schedule health checks

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Ensure dependencies are in package.json
- Verify monorepo workspace structure

### Database Connection Issues
- Ensure `DATABASE_URL` uses Supabase **connection pooler** (port 6543)
- Check Supabase allows connections from all IPs (or add Render IPs)
- Test connection string locally first

### App Crashes on Start
- View logs for error messages
- Check all environment variables are set
- Verify database migrations have been run

### 502 Bad Gateway
- Check if app is listening on `PORT` environment variable (should be 4000)
- Verify start command is correct
- Check logs for startup errors

## Updating Your App

Render automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Update feature"
git push origin main
```

Render detects the push and redeploys automatically (takes 2-5 minutes).

## Cost Comparison

| Plan | Price | Features |
|------|-------|----------|
| **Free** | $0/month | 750 hours, 512MB RAM, auto-sleep |
| **Starter** | $7/month | Always on, 512MB RAM, custom domain |
| **Standard** | $25/month | 2GB RAM, priority support |

Free tier is perfect for development and low-traffic production apps.

## Next Steps

1. ✅ Deploy backend to Render
2. Deploy frontend to Vercel (separate project)
3. Update frontend `.env` with Render backend URL
4. Update `CORS_ORIGINS` in Render to include frontend URL
5. Test the full stack

## Alternative: Auto-Deploy with render.yaml

The repository includes `render.yaml` for infrastructure-as-code:

1. In Render dashboard, click "New +" → "Blueprint"
2. Connect your repo
3. Render will auto-configure from `render.yaml`
4. Just add `DATABASE_URL` in the Render dashboard

## Support

- Render Docs: https://render.com/docs
- Render Community: https://community.render.com
- GitHub Issues: https://github.com/Shivstic-hell/wrike-clone/issues

---

**Ready to deploy?** Follow the steps above and your backend will be live in minutes! 🚀
