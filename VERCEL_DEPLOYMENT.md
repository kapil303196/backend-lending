# Vercel Deployment Guide

## ✅ Your backend is now ready for Vercel deployment!

### Changes Made:
1. **Created `vercel.json`** - Configuration file for Vercel deployment
2. **Updated `server.js`** - Modified to work in both local and serverless environments
3. **Created `.vercelignore`** - Excludes unnecessary files from deployment

---

## 🚀 Deployment Steps

### Step 1: Add Environment Variables to Vercel

Before deploying, you **MUST** add your environment variables to Vercel:

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add the following variables:

```
MONGODB_URI=<your-mongodb-connection-string>
PORT=3000
NODE_ENV=production
AWS_ACCESS_KEY_ID=<your-aws-access-key>
AWS_SECRET_ACCESS_KEY=<your-aws-secret-key>
AWS_REGION=<your-aws-region>
AWS_S3_BUCKET=<your-s3-bucket-name>
GOOGLE_MAPS_API_KEY=<your-google-maps-api-key>
```

⚠️ **IMPORTANT**: Make sure to copy these from your local `.env` file!

---

### Step 2: Deploy to Vercel

Choose one of the following methods:

#### **Option A: Deploy via Vercel CLI** (Recommended)

1. Install Vercel CLI (if not already installed):
   ```bash
   npm install -g vercel
   ```

2. Login to Vercel:
   ```bash
   vercel login
   ```

3. Deploy from the backend directory:
   ```bash
   cd /Users/apple/Desktop/projects/cameron/lending/backend-lending
   vercel
   ```

4. Follow the prompts and wait for deployment to complete

5. For production deployment:
   ```bash
   vercel --prod
   ```

#### **Option B: Deploy via Git Integration**

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Fix Vercel deployment configuration"
   git push origin main
   ```

2. Go to [vercel.com](https://vercel.com)
3. Click **"Import Project"**
4. Select your repository
5. Configure the project:
   - **Framework Preset**: Other
   - **Root Directory**: `backend-lending` (if monorepo)
   - **Build Command**: Leave empty
   - **Output Directory**: Leave empty
6. Add environment variables (see Step 1)
7. Click **"Deploy"**

---

### Step 3: Verify Deployment

Once deployed, test your endpoints:

1. **Health Check**:
   ```
   https://your-app.vercel.app/health
   ```

2. **API Documentation**:
   ```
   https://your-app.vercel.app/api-docs
   ```

3. **Test an API endpoint**:
   ```
   https://your-app.vercel.app/api/mca
   ```

---

## 🔍 Troubleshooting

### If you still get errors:

1. **Check Vercel Logs**:
   - Go to Vercel Dashboard → Your Project → **Deployments**
   - Click on the failed deployment
   - Navigate to **"Functions"** tab
   - Check the logs for detailed error messages

2. **Common Issues**:

   - **MongoDB Connection Error**: Make sure `MONGODB_URI` is set in Vercel environment variables
   - **Missing Dependencies**: Run `npm install` locally and ensure `package.json` is updated
   - **AWS S3 Errors**: Verify AWS credentials in Vercel environment variables
   - **Module Not Found**: Check that all dependencies are in `dependencies` (not `devDependencies`)

3. **View Real-Time Logs**:
   ```bash
   vercel logs your-deployment-url
   ```

---

## 📝 Notes

- **Serverless Functions**: Your Express app now runs as a serverless function on Vercel
- **Cold Starts**: First request may be slower (cold start) - this is normal
- **Local Development**: Works exactly as before with `npm run dev`
- **MongoDB Atlas**: Make sure your MongoDB Atlas cluster allows connections from anywhere (0.0.0.0/0) or add Vercel's IP ranges

---

## 🎯 Next Steps

1. Deploy using one of the methods above
2. Test all your endpoints
3. Update your frontend to use the new Vercel URL
4. Consider setting up a custom domain in Vercel settings

---

## 🆘 Still Having Issues?

If you continue to see errors, please share:
1. The full error message from Vercel logs
2. Your deployment URL
3. Screenshots of the error

Good luck! 🚀
