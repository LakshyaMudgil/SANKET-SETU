import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Config } from '@netlify/functions';

export default async (req: Request) => {
  if (!['GET', 'HEAD'].includes(req.method)) return new Response('Method not allowed', { status: 405 });
  const routes: Record<string, string> = {
    '/': 'home', '/speech-to-sign': 'speech_to_sign',
    '/sign-to-speech': 'sign_to_speech', '/companion': 'companion',
  };
  const links: Record<string, string> = {
    home: '/', speech_to_sign: '/speech-to-sign', sign_to_speech: '/sign-to-speech', companion: '/companion',
  };
  const page = routes[new URL(req.url).pathname.replace(/\/$/, '') || '/'];
  if (!page) return new Response('Page not found', { status: 404 });
  const template = await readFile(join(process.cwd(), 'sanketsetu/templates', `${page}.html`), 'utf8');
  let html = template.replace(/\{\{\s*url_for\('([^']+)'(?:,\s*filename='([^']+)')?\)\s*\}\}/g,
    (_, route: string, filename: string) => route === 'static' ? `/static/${filename}` : links[route]);
  if (page === 'sign_to_speech') {
    html = html.replace('id="camToggle" type="button">Start camera', 'id="camToggle" type="button" disabled>Camera unavailable');
    html = html.replace('<p class="notice" id="notice" role="status" aria-live="polite" hidden></p>', '<p class="notice" id="notice" role="status" aria-live="polite">Camera recognition needs a Python recognition service, which has not been deployed. You can use <a href="/speech-to-sign">Speech → Sign</a> for text and voice input.</p>');
    for (const id of ['addBtn', 'spaceBtn', 'backBtn', 'clearBtn']) {
      html = html.replace(`id="${id}"`, `id="${id}" disabled`);
    }
  }
  return new Response(req.method === 'HEAD' ? null : html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};

export const config: Config = {
  path: ['/', '/speech-to-sign', '/sign-to-speech', '/companion'], 
};
