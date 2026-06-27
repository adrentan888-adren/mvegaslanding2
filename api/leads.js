function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function isAuthorized(req) {
  const password = process.env.LEADS_ADMIN_PASSWORD;
  return Boolean(password) && getBearerToken(req) === password;
}

function parseLimit(value) {
  const limit = Number(value || 100);
  if (!Number.isFinite(limit)) return 100;
  return Math.min(Math.max(Math.trunc(limit), 1), 500);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ ok: false, message: 'Unauthorized.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_LEADS_TABLE || 'leads';

  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ ok: false, message: 'Supabase lead storage is not configured.' });
  }

  const url = new URL(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}`);
  url.searchParams.set('select', 'id,created_at,submitted_at,full_name,phone,loan_amount,state,source_url,event_id,meta_status,email_status');
  url.searchParams.set('order', 'created_at.desc');
  url.searchParams.set('limit', String(parseLimit(req.query?.limit)));

  const response = await fetch(url, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`
    }
  });

  const result = await response.json().catch(() => []);
  if (!response.ok) {
    return res.status(502).json({
      ok: false,
      message: result?.message || 'Failed to fetch Supabase leads.'
    });
  }

  res.status(200).json({ ok: true, leads: result });
}
