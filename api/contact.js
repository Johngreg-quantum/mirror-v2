/* Contact form of johngreg.com. Sends the visitor's message to John through Resend, from the site's own
   domain, with Reply-To set to the visitor so John can answer straight from his inbox. The visitor then gets
   a short confirmation with fixed text: nothing they typed goes into it, so the form can't be used to send
   spam to other people.
   It needs two environment variables in Vercel: RESEND_API_KEY and CONTACT_TO (John's inbox). Neither is
   written here, so this file can be read by anyone without exposing them. */
const FROM = 'John Greg <contacto@johngreg.com>';
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/;
const CONFIRM = {
  es: { subject: 'Recibí tu mensaje', text: 'Hola,\n\nRecibí tu mensaje en johngreg.com. Te escribo pronto a este correo.\n\nJohn Greg\nMiami, FL' },
  en: { subject: 'I got your message', text: 'Hi,\n\nI got your message on johngreg.com. I will write back to this address soon.\n\nJohn Greg\nMiami, FL' }
};

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
const oneLine = s => s.replace(/\s+/g, ' ');
const esc = s => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

async function send(key, mail) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(mail)
  });
  if (!r.ok) throw new Error('Resend answered ' + r.status + ': ' + (await r.text()).slice(0, 300));
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'method' });
  }
  const key = process.env.RESEND_API_KEY;
  const to = process.env.CONTACT_TO;
  if (!key || !to) return res.status(503).json({ ok: false, error: 'not-configured' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object') return res.status(400).json({ ok: false, error: 'invalid' });

  /* Bots fill every field, including the hidden one, and submit within moments of loading the page.
     They get a normal "sent" answer so they learn nothing, but nothing is sent. */
  if (clean(body.website, 200) || Number(body.ms) < 2500) return res.status(200).json({ ok: true });

  const name = oneLine(clean(body.name, 100));
  const email = oneLine(clean(body.email, 200));
  const message = clean(body.message, 5000);
  const lang = body.lang === 'en' ? 'en' : 'es';
  if (name.length < 2 || !EMAIL.test(email) || message.length < 5) return res.status(400).json({ ok: false, error: 'invalid' });

  try {
    await send(key, {
      from: FROM,
      to: [to],
      reply_to: email,
      subject: 'johngreg.com: mensaje de ' + name,
      text: name + ' (' + email + ') escribió desde johngreg.com:\n\n' + message + '\n\nResponde a este correo para contestarle.',
      html: '<p><strong>' + esc(name) + '</strong> (' + esc(email) + ') escribió desde johngreg.com:</p>' +
        '<p style="white-space:pre-wrap">' + esc(message) + '</p><p style="color:#777">Responde a este correo para contestarle.</p>'
    });
  } catch (e) {
    console.error('contact: message to John failed:', e.message);
    return res.status(502).json({ ok: false, error: 'send' });
  }

  try {
    await send(key, { from: FROM, to: [email], subject: CONFIRM[lang].subject, text: CONFIRM[lang].text });
  } catch (e) {
    console.error('contact: confirmation failed:', e.message);   // John already has the message, so the visitor still sees "sent"
  }
  return res.status(200).json({ ok: true });
};
