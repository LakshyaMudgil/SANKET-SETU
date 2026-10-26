# Vercel and Netlify Deployment

The Flask app can run directly on Vercel for text-to-sign and the companion. Its server-side camera recognizer is disabled there: Vercel's supported Python runtime is 3.12+, while this project's TensorFlow 2.15/MediaPipe stack is pinned for Python 3.11. The full camera stack remains in `requirements-vision.txt` and is installed by the Docker/Render deployment.

Netlify serves the existing interface with native Node functions for text processing, history, and the optional companion. The Python camera recognizer remains a separate service.

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

Import the repository with its root as the base directory. The root `netlify.toml` publishes `sanketsetu/static` and deploys the TypeScript functions in `netlify/functions`. No build command or separate Python host is required for the pages, text processing, or history. The functions render the existing templates and preserve `/static/` asset URLs.

Text-to-sign uses Netlify AI Gateway to translate Hindi/English into an approximate content-word gloss. It is a prototype, not a verified ISL translation; unsupported vocabulary uses the existing fingerspelling animations. AI requests use the site's Netlify credits. Conversion history uses Netlify Database; its schema and migration are included in the repository.

The optional memory companion keeps its Hindsight integration. Configure its credentials through the hosting dashboard, never in source files. Without configuration, the page explains that memory is unavailable.

Camera recognition still requires the Python 3.11 TensorFlow/MediaPipe service. It does not run inside the Node functions. The health endpoint reports it as unavailable, and the camera page explains the limitation before requesting camera access. The standalone Python microphone bridge is not enabled on this deployment; browser speech input remains available.

For local development, use `netlify dev --port 8889`. Run `npm run check` and `npm test` for validation.

## Requirements and Secrets

- `requirements.txt`: Flask, NLP, history, and companion dependencies used by Vercel and Docker.
- `requirements-vision.txt`: optional Python 3.11 TensorFlow/Keras/MediaPipe stack used by Docker deployments that enable camera recognition.
- `requirements.txt` does not configure a subdomain. DNS/domain attachment belongs in the Vercel or Netlify dashboard.
- Put real API keys only in local `.env` files or the hosting provider's encrypted environment-variable settings. Never commit `.env` or a real key in `.env.example`.