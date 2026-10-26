import type { Config } from '@netlify/functions';

export default async (req: Request) => {
  const path = new URL(req.url).pathname;
  const detail = 'Hand tracking runs on your device. Open Sign → Speech and start the camera; server-side sign recognition is not used.';
  if (path === '/api/health') return Response.json({ status: 'ok', sign_to_speech: { ready: true, mode: 'browser', translation: false } });
  if (path === '/sanketsetu/next') return Response.json({ text: null });
  return Response.json({ error: 'model_unavailable', message: detail, detail }, { status: 503 });
};
export const config: Config = { path: ['/api/health', '/api/sign/predict', '/api/sign/action', '/sanketsetu/next'] };
