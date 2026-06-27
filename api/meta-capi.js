import crypto from 'crypto';

function sha256(value) {
  if (!value) return undefined;
  return crypto.createHash('sha256').update(String(value).trim().toLowerCase()).digest('hex');
}

function cleanPhone(value) {
  if (!value) return undefined;
  const digits = String(value).replace(/\D/g, '');
  if (digits.startsWith('60')) return `+${digits}`;
  if (digits.startsWith('0')) return `+6${digits}`;
  return `+${digits}`;
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const match = cookies.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== ''));
}

function buildUserData(req, user = {}) {
  const phone = cleanPhone(user.phone);
  const nameParts = String(user.fullName || '').trim().split(/\s+/).filter(Boolean);
  const firstName = user.firstName || nameParts[0];
  const lastName = user.lastName || nameParts.slice(1).join(' ');
  return compact({
    em: sha256(user.email),
    ph: phone ? sha256(phone) : undefined,
    fn: sha256(firstName),
    ln: sha256(lastName),
    client_ip_address: getClientIp(req),
    client_user_agent: req.headers['user-agent'],
    fbp: getCookie(req, '_fbp'),
    fbc: getCookie(req, '_fbc')
  });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendPurchaseEmail({ user = {}, event_id, event_source_url }) {
  const apiKey = process.env.BREVO_API_KEY;
  const to = process.env.LEAD_EMAIL_TO || 'shawn6027@gmail.com';
  const bcc = process.env.LEAD_EMAIL_BCC || 'jamespcr19@gmail.com,adrenjack188@gmail.com';
  const senderEmail = process.env.BREVO_SENDER_EMAIL || to;
  const senderName = process.env.BREVO_SENDER_NAME || 'Yayasan Prihatin Sdn Bhd';

  if (!apiKey) {
    return { skipped: true, message: 'Brevo API key is not configured.' };
  }

  const fields = [
    ['Nama Penuh', user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim()],
    ['Email', user.email],
    ['Nombor Telefon', user.phone],
    ['Jumlah Pinjaman', user.loanAmount],
    ['Area / Negeri', user.state],
    ['Event ID', event_id],
    ['Source URL', event_source_url],
    ['Submitted at', new Date().toISOString()]
  ];

  const text = fields.map(([label, value]) => `${label}: ${value || ''}`).join('\n');
  const html = `
    <h2>Yayasan Prihatin tiktok loan submission</h2>
    <table cellpadding="6" cellspacing="0" border="0">
      ${fields.map(([label, value]) => `
        <tr>
          <td><strong>${escapeHtml(label)}</strong></td>
          <td>${escapeHtml(value)}</td>
        </tr>
      `).join('')}
    </table>
  `;

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender: {
        name: senderName,
        email: senderEmail
      },
      to: [{ email: to }],
      ...(bcc ? { bcc: bcc.split(',').map((email) => ({ email: email.trim() })).filter((item) => item.email) } : {}),
      subject: 'New Yayasan Prihatin tiktok loan submission',
      textContent: text,
      htmlContent: html
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.message || 'Brevo email failed.');
  }

  return result;
}

async function sendTikTokEvent({ req, event_name, event_id, event_source_url, user = {}, custom_data = {} }) {
  const pixelId = process.env.TIKTOK_PIXEL_ID;
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;

  if (!pixelId || !accessToken) {
    return { skipped: true, message: 'TikTok Events API is not configured.' };
  }

  const phone = cleanPhone(user.phone);
  const tiktokEventName = event_name === 'Purchase' ? 'SubmitForm' : event_name;
  const value = Number(process.env.PURCHASE_VALUE || custom_data?.value || 1);
  const currency = process.env.PURCHASE_CURRENCY || custom_data?.currency || 'MYR';
  const properties = compact({
    value,
    currency,
    content_type: 'product',
    contents: [
      {
        content_id: 'personal_loan_application',
        content_name: user.loanAmount || custom_data?.contents?.[0]?.content_name || 'Pinjaman Peribadi',
        content_category: 'loan_application',
        quantity: 1,
        price: value
      }
    ],
    search_string: custom_data?.search_string,
    contact_url: custom_data?.contact_url,
    button_name: custom_data?.button_name,
    description: event_name === 'Purchase' ? user.loanAmount : undefined
  });
  const event = compact({
    event: tiktokEventName,
    event_time: Math.floor(Date.now() / 1000),
    event_id,
    user: compact({
      external_id: sha256(event_id),
      phone: phone ? sha256(phone) : undefined,
      ip: getClientIp(req),
      user_agent: req.headers['user-agent'],
      ttp: getCookie(req, '_ttp'),
      ttclid: getCookie(req, 'ttclid')
    }),
    page: compact({
      url: event_source_url,
      referrer: req.headers.referer
    }),
    properties
  });

  const response = await fetch('https://business-api.tiktok.com/open_api/v1.3/event/track/', {
    method: 'POST',
    headers: {
      'Access-Token': accessToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      event_source: 'web',
      event_source_id: pixelId,
      data: [event]
    })
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok || (result?.code && result.code !== 0 && result.code !== '0')) {
    throw new Error(result?.message || 'TikTok Events API request failed.');
  }

  return result;
}

async function saveLeadToSupabase({ req, user = {}, event_id, event_source_url, metaOk, emailOk }) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_LEADS_TABLE || 'leads';

  if (!supabaseUrl || !serviceRoleKey) {
    return { skipped: true, message: 'Supabase lead storage is not configured.' };
  }

  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(table)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal'
    },
    body: JSON.stringify({
      submitted_at: new Date().toISOString(),
      full_name: user.fullName || `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      phone: user.phone,
      loan_amount: user.loanAmount,
      state: user.state,
      source_url: event_source_url,
      event_id,
      meta_status: metaOk ? 'success' : 'fail',
      email_status: emailOk ? 'success' : 'fail',
      user_agent: req.headers['user-agent'],
      client_ip: getClientIp(req)
    })
  });

  const text = await response.text();
  let result;
  try {
    result = text ? JSON.parse(text) : {};
  } catch {
    result = { message: text };
  }

  if (!response.ok || result?.ok === false) {
    throw new Error(result?.message || result?.hint || 'Supabase lead storage failed.');
  }

  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, message: 'Method not allowed.' });
  }

  const pixelId = process.env.META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  const apiVersion = process.env.META_API_VERSION || 'v20.0';

  if (!pixelId || !accessToken || pixelId === 'your_meta_pixel_id') {
    return res.status(202).json({
      ok: false,
      skipped: true,
      message: 'Meta credentials are not configured.'
    });
  }

  const { event_name, event_id, event_source_url, user, custom_data } = req.body || {};
  if (!['ViewContent', 'Purchase', 'Search', 'Contact', 'ClickButton', 'AddToWishlist', 'CompleteRegistration', 'Lead'].includes(event_name) || !event_id || !event_source_url) {
    return res.status(400).json({ ok: false, message: 'Invalid event payload.' });
  }

  const isMetaEvent = ['ViewContent', 'Purchase', 'Search'].includes(event_name);
  const event = compact({
    event_name,
    event_time: Math.floor(Date.now() / 1000),
    event_id,
    event_source_url,
    action_source: 'website',
    user_data: buildUserData(req, user),
    custom_data: event_name === 'Purchase'
      ? compact({
          value: Number(process.env.PURCHASE_VALUE || custom_data?.value || 1),
          currency: process.env.PURCHASE_CURRENCY || custom_data?.currency || 'MYR'
        })
      : event_name === 'Search'
        ? compact({ search_string: custom_data?.search_string })
        : event_name === 'Contact'
          ? compact({ contact_url: custom_data?.contact_url })
          : event_name === 'ClickButton'
            ? compact({ button_name: custom_data?.button_name })
            : undefined
  });

  const payload = {
    data: [event],
    ...(process.env.META_TEST_EVENT_CODE ? { test_event_code: process.env.META_TEST_EVENT_CODE } : {})
  };

  let result = { skipped: true, message: 'Meta event skipped for TikTok-only event.' };
  let metaOk = true;
  if (isMetaEvent) {
    const url = `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    result = await response.json().catch(() => ({}));
    metaOk = response.ok;
  }
  let tiktokResult;
  let tiktokError;

  if (!metaOk) {
    return res.status(502).json({
      ok: false,
      step: 'meta',
      message: result?.error?.message || 'Meta CAPI request failed.',
      metaOk,
      meta: result
    });
  }

  try {
    tiktokResult = await sendTikTokEvent({ req, event_name, event_id, event_source_url, user, custom_data });
  } catch (error) {
    tiktokError = error.message;
  }

  let emailResult;
  let storageResult;
  let storageError;
  if (event_name === 'Purchase') {
    try {
      emailResult = await sendPurchaseEmail({ user, event_id, event_source_url });
    } catch (error) {
      return res.status(502).json({
        ok: false,
        step: 'email',
        message: error.message,
        metaOk,
        meta: result,
        emailOk: false
      });
    }

    try {
      storageResult = await saveLeadToSupabase({
        req,
        user,
        event_id,
        event_source_url,
        metaOk,
        emailOk: !emailResult?.skipped
      });
    } catch (error) {
      storageError = error.message;
    }
  }

  res.status(200).json({
    ok: true,
    metaOk,
    meta: result,
    emailOk: event_name === 'Purchase' ? !emailResult?.skipped : undefined,
    email: emailResult,
    tiktokOk: tiktokResult ? !tiktokResult.skipped : false,
    tiktok: tiktokResult,
    tiktokError,
    storageOk: event_name === 'Purchase' ? Boolean(storageResult && !storageResult.skipped) : undefined,
    storage: storageResult,
    storageError
  });
}
