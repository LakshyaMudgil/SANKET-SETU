# Deployment

The supported deployment instructions are in [FREE_DEPLOYMENT_RENDER.md](FREE_DEPLOYMENT_RENDER.md).

For Vercel's lighter Python deployment or a Netlify custom-domain proxy in front of a hosted Flask backend, see [DEPLOYMENT_VERCEL_NETLIFY.md](DEPLOYMENT_VERCEL_NETLIFY.md).

That guide matches `render.yaml`. The Render free plan sets `SIGN_TO_SPEECH_ENABLED=false` because the server-side TensorFlow/OpenCV recognizer exceeds its memory budget. To enable camera recognition, use a larger host and set `SIGN_TO_SPEECH_ENABLED=true`.

For local Docker development, copy `.env.example` to `.env`, set the Hindsight credentials, then run:

```bash
docker build -t sanketsetu .
docker run --env-file .env -p 8080:8080 sanketsetu
```
