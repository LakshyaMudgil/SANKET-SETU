import type { Config } from '@netlify/functions';
import { drizzle } from 'drizzle-orm/netlify-db';
import { and, desc, eq } from 'drizzle-orm';
import { histories } from '../../db/schema.js';

export default async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;
  const expectedMethod = path === '/save_history' ? 'POST' : path === '/get_history' ? 'GET' : 'DELETE';
  if (req.method !== expectedMethod) return Response.json({ error: 'Method not allowed' }, { status: 405 });
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try { body = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!body || typeof body !== 'object') return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const browserId = String(body.browser_id || url.searchParams.get('browser_id') || '');
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(browserId)) {
    return Response.json({ error: 'Valid browser_id required' }, { status: 400 });
  }
  try {
    const db = drizzle();
    const own = eq(histories.browserId, browserId);
    if (path === '/get_history') {
      return Response.json(await db.select().from(histories).where(own).orderBy(desc(histories.timestamp)).limit(100));
    }
    if (path === '/save_history') {
      if (typeof body.original_text !== 'string' || typeof body.isl_text !== 'string' || body.original_text.length > 2000 || body.isl_text.length > 2000) {
        return Response.json({ error: 'Text is required (up to 2,000 characters)' }, { status: 400 });
      }
      const [entry] = await db.insert(histories).values({ browserId, original_text: body.original_text, isl_text: body.isl_text }).returning();
      return Response.json({ message: 'History saved', id: entry._id }, { status: 201 });
    }
    if (path === '/clear_history') await db.delete(histories).where(own);
    else {
      const id = path.split('/').pop() || '';
      if (!/^[a-f0-9-]{36}$/i.test(id)) return Response.json({ error: 'Invalid entry ID' }, { status: 400 });
      await db.delete(histories).where(and(own, eq(histories._id, id)));
    }
    return Response.json({ message: 'History deleted' });
  } catch {
    return Response.json({ error: 'History is temporarily unavailable. Please try again.' }, { status: 503 });
  }
};
export const config: Config = { path: ['/save_history', '/get_history', '/clear_history', '/delete_history/:id'] };
