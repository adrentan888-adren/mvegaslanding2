const state = {
  pixelId: '',
  purchaseValue: 1,
  purchaseCurrency: 'MYR'
};

const whatsappUrl = 'https://minatmohonloan.wasap.my';
const socialProofMessages = [
  'Permohonan RM7,200 oleh A****n bin S*****i dari Klang telah diluluskan 27 minit yang lalu.',
  'Permohonan RM10,800 oleh F****z bin R*****i dari Petaling Jaya telah diluluskan 43 minit yang lalu.',
  'Permohonan RM14,500 oleh N****l bin A*****d dari Puchong telah diluluskan 1 jam yang lalu.',
  'Permohonan RM5,300 oleh S****l bin H*****i dari Subang Jaya telah diluluskan 1 jam 18 minit yang lalu.',
  'Permohonan RM2,100 oleh R****n bin M*****d dari Rawang telah diluluskan 2 jam yang lalu.',
  'Permohonan RM8,600 oleh K****r bin A*****n dari Ampang telah diluluskan 2 jam 35 minit yang lalu.',
  'Permohonan RM12,000 oleh Z****l bin R*****i dari Selayang telah diluluskan 3 jam yang lalu.',
  'Permohonan RM4,700 oleh I****n bin Y*****b dari Gombak telah diluluskan 3 jam 42 minit yang lalu.'
];

function eventId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID()}`;
}

function loadPixel(pixelId) {
  if (!pixelId || pixelId === 'your_meta_pixel_id') return;
  if (window.fbq && window.fbq.loaded) return;

  window.fbq = window.fbq || function fbqProxy() {
    window.fbq.callMethod
      ? window.fbq.callMethod.apply(window.fbq, arguments)
      : window.fbq.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = window.fbq;
  window.fbq.push = window.fbq;
  window.fbq.loaded = true;
  window.fbq.version = '2.0';
  window.fbq.queue = [];

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(script);

  window.fbq('init', pixelId);
}

async function sendCapi(payload) {
  return fetch('/api/meta-capi', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

async function trackViewContent() {
  const id = eventId('vc');
  if (window.fbq) {
    window.fbq('track', 'ViewContent', {}, { eventID: id });
  }

  await sendCapi({
    event_name: 'ViewContent',
    event_id: id,
    event_source_url: window.location.href
  });
}

async function trackPurchase(user) {
  const id = eventId('purchase');
  const customData = {
    value: state.purchaseValue,
    currency: state.purchaseCurrency
  };

  if (window.fbq) {
    window.fbq('track', 'Purchase', customData, { eventID: id });
  }

  return sendCapi({
    event_name: 'Purchase',
    event_id: id,
    event_source_url: window.location.href,
    user,
    custom_data: customData
  });
}

async function boot() {
  const config = await fetch('/api/config').then((response) => response.json());
  Object.assign(state, config);
  loadPixel(state.pixelId);
  await trackViewContent();
}

document.getElementById('purchaseForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('submitButton');
  const status = document.getElementById('status');

  if (!form.reportValidity()) return;

  const data = new FormData(form);
  button.disabled = true;
  status.textContent = 'Sedang menghantar...';

  try {
    const response = await trackPurchase({
      fullName: data.get('fullName'),
      phone: data.get('phone'),
      loanAmount: data.get('loanAmount'),
      state: data.get('state')
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok || result.skipped) {
      throw new Error(result.message || 'Submission failed.');
    }

  } catch (error) {
    console.error('Submission tracking failed:', error);
  } finally {
    status.textContent = 'Permohonan dihantar. Sedang membuka WhatsApp...';
    window.location.href = whatsappUrl;
    button.disabled = false;
  }
});

boot().catch(() => {
  document.getElementById('status').textContent = 'Konfigurasi tracking tidak dapat dimuatkan.';
});

function startSocialProof() {
  const toast = document.getElementById('socialProof');
  const text = document.getElementById('socialProofText');
  if (!toast || !text) return;

  let index = Math.floor(Math.random() * socialProofMessages.length);

  function showNext() {
    text.textContent = socialProofMessages[index];
    toast.classList.add('is-visible');
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
    }, 5200);
    index = (index + 1) % socialProofMessages.length;
  }

  window.setTimeout(showNext, 1800);
  window.setInterval(showNext, 7600);
}

startSocialProof();
