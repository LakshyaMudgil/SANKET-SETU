# Vercel and Netlify Deployment

The Flask app can run directly on Vercel for text-to-sign and the companion. Its server-side camera recognizer is disabled there: Vercel's supported Python runtime is 3.12+, while this project's TensorFlow 2.15/MediaPipe stack is pinned for Python 3.11. The full camera stack remains in `requirements-vision.txt` and is installed by the Docker/Render deployment.

Netlify is configured here as an HTTPS custom-domain proxy to the Flask backend. It does not run this Flask application as a Netlify Function.

## Vercel

1. Import this repository into Vercel with the repository root as the project root.
2. Keep the Python version at 3.12; `.python-version` sets this for Vercel.
3. Add these environment variables in **Project Settings → Environment Variables**:
   - `SIGN_TO_SPEECH_ENABLED=false`
   - `HINDSIGHT_API_KEY` and `HINDSIGHT_BASE_URL` if using the companion
   - `MONGO_URI` only if using history
   - `RATELIMIT_STORAGE_URI` backed by a managed Redis service for limits shared across serverless instances
4. Deploy. The Python function serves the Flask routes and static files. The camera page will explain that server-side sign recognition is disabled on this deployment.
5. In **Settings → Domains**, add your subdomain (for example, `app.example.com`) and create the DNS record Vercel displays. Vercel provisions HTTPS after DNS verification.

The root `requirements.txt` contains the Vercel-compatible core. Do not install `requirements-vision.txt` on Vercel: it pins TensorFlow 2.15 for Python 3.11 and is intentionally excluded from the function bundle. `vercel.json` also excludes the CNN model, tests, and build documentation.

## Netlify

Netlify serves the project through the proxy rule in `netlify.toml`; the Flask backend must already be deployed separately.

1. Deploy the Docker service described by `render.yaml` to Render or another host that runs persistent Flask containers.
2. In `netlify.toml`, replace `https://sign-language-app.onrender.com` with the exact HTTPS origin assigned to your backend.
3. Import this repository into Netlify with the repository root as the base directory. `netlify.toml` sets `static` as the publish directory and proxies every path, including API and static asset requests, to the backend.
4. Add the subdomain in **Domain management** and configure the DNS record Netlify displays. Wait for HTTPS provisioning.

The Netlify proxy has a 26-second request timeout. Avoid a sleeping backend for camera requests, and use a backend with enough memory before setting `SIGN_TO_SPEECH_ENABLED=true`. The current Render free configuration disables camera recognition. Since the browser and Flask app share the Netlify origin through the proxy, `CORS_ORIGINS` can remain blank.

## Requirements and Secrets

- `requirements.txt`: Flask, NLP, history, and companion dependencies used by Vercel and Docker.
- `requirements-vision.txt`: optional Python 3.11 TensorFlow/Keras/MediaPipe stack used by Docker deployments that enable camera recognition.
- `requirements.txt` does not configure a subdomain. DNS/domain attachment belongs in the Vercel or Netlify dashboard.
- Put real API keys only in local `.env` files or the hosting provider's encrypted environment-variable settings. Never commit `.env` or a real key in `.env.example`.