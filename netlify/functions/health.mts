import type { Config } from '@netlify/functions';

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  const detail = 'Camera recognition requires the Python TensorFlow/MediaPipe service, which has not been deployed. Speech → Sign is available from the navigation.';
  if (path === '/api/health') return Response.json({ status: 'ok', sign_to_speech: { ready: false, error: detail } });
  if (path === '/sanketsetu/next') return Response.json({ text: null });
  return Response.json({ error: 'model_unavailable', message: detail, detail }, { status: 503 });
};
export const config: Config = { path: ['/api/health', '/api/sign/predict', '/api/sign/action', '/sanketsetu/next'] };
