# Render Deployment Configuration

## ✅ Fixed Issues

1. **Added `build` and `start` scripts** to `package.json` for Render
2. **Created `render.yaml`** with correct configuration
3. **Added `esbuild`** to devDependencies (needed for build)

## 📁 Server File Location

- **Source file**: `server/index.ts` (TypeScript)
- **Built file**: `server_dist/index.js` (after running `npm run build`)

## 🚀 Render Configuration

### In Render Dashboard:

1. **Build Command**: `npm install && npm run build`
   - This installs dependencies and builds `server/index.ts` → `server_dist/index.js`

2. **Start Command**: `npm start`
   - This runs `npm run server:prod` which executes `node server_dist/index.js`

### Environment Variables (Set in Render Dashboard):

- `NODE_ENV=production`
- `DATABASE_URL` (your Supabase connection string)
- `JWT_SECRET` (32+ character secret)
- `PORT` (automatically set by Render)
- `GOOGLE_MAPS_API_KEY` (if needed)
- `EXTERNAL_API_URL` (if needed)
- Any other variables from your `.env` file

## 📝 Steps to Deploy

1. **Push code to GitHub** (if using Git)
2. **Connect repository to Render**
3. **Create new Web Service**
4. **Use these settings**:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment**: Node
5. **Add all environment variables** from your `.env` file
6. **Deploy!**

## ✅ Verification

After deployment, test:
- `https://your-app.onrender.com/api/external/health`
- Should return a response if server is running

## 🔧 Troubleshooting

If you see "Cannot find module server/index.js":
- ✅ **FIXED**: The build command now creates `server_dist/index.js`
- ✅ **FIXED**: The start command now points to the correct file

If build fails:
- Make sure `esbuild` is installed (added to devDependencies)
- Check that all dependencies are in `package.json`

If server doesn't start:
- Check environment variables are set correctly
- Check server logs in Render dashboard
- Verify `DATABASE_URL` is correct
