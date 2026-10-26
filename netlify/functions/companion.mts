import type { Config, Context } from '@netlify/functions';
import { HindsightClient } from '@vectorize-io/hindsight-client';

export default async (req: Request, context: Context) => {
  const path = new URL(req.url).pathname;
  const isStatus = path === '/api/companion/status';
  if (req.method !== (isStatus ? 'GET' : 'POST')) return Response.json({ error: 'Method not allowed' }, { status: 405 });
  const apiKey = Netlify.env.get('HINDSIGHT_API_KEY');
  const missing = 'The memory companion is not configured on this site yet. Speech → Sign is available from the navigation.';
  if (!apiKey) return Response.json(isStatus ? { configured: false, provider: 'Hindsight', message: missing } : { error: missing }, { status: isStatus ? 200 : 503 });
  const client = new HindsightClient({ baseUrl: Netlify.env.get('HINDSIGHT_BASE_URL') || 'https://api.hindsight.vectorize.io', apiKey, maxAttempts: 1 });
  try {
    if (isStatus) {
      await client.getVersion({ signal: AbortSignal.timeout(5000) });
      return Response.json({ configured: true, provider: 'Hindsight', message: "Ready to learn from this browser's conversations." });
    }
    let data;
    try { data = await req.json(); } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!/^[a-f0-9-]{32,36}$/.test(data?.user_id || '')) return Response.json({ error: 'Valid browser ID required' }, { status: 400 });
    const bank = `sanketsetu-${data.user_id.replace(/-/g, '')}`;
    if (path === '/api/companion/forget') {
      await client.deleteBank(bank, { signal: AbortSignal.timeout(10000) });
      return Response.json({ message: 'Your Setu memory bank was deleted.' });
    }
    const message = typeof data.message === 'string' ? data.message.trim() : '';
    if (!message || message.length > 1200) return Response.json({ error: 'Enter a message up to 1,200 characters.' }, { status: 400 });
    await client.createBank(bank, { name: 'SanketSetu communication companion', reflectMission: 'You are Setu, a concise, respectful communication companion for ISL, Hindi and English. Help prepare clear phrases. Do not claim ASL fingerspelling is ISL. Never invent user preferences.' });
    const recalled = await client.recall(bank, message, { budget: 'low', signal: AbortSignal.timeout(10000) });
    const memories = recalled.results.slice(0, 4).map(item => item.text);
    const answer = await client.reflect(bank, message, { budget: 'low', context: 'Use relevant recalled memories only. Ask when meaning is ambiguous.', signal: AbortSignal.timeout(20000) });
    if (!answer.text?.trim()) throw new Error('Empty response');
    context.waitUntil(client.retain(bank, message, { context: 'SanketSetu user communication companion message', metadata: { source: 'sanketsetu-companion', kind: 'user-message' } }).catch(() => undefined));
    return Response.json({ reply: answer.text, memories, memory_used: memories.length > 0 });
  } catch {
    return Response.json(isStatus ? { configured: false, provider: 'Hindsight', message: 'The memory service could not be reached. Please try again later.' } : { error: 'The memory service could not complete the request. Please try again.' }, { status: isStatus ? 200 : 502 });
  }
};
export const config: Config = { path: ['/api/companion/status', '/api/companion/respond', '/api/companion/forget'], rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
