const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const fetch = (...args) =>
  import('node-fetch').then(({ default: fetch }) => fetch(...args));

const app = express();
const PORT = 3000;

// DIRECTORY FOR STORED PASTES
const pastesDir = path.join(__dirname, './pastes');
if (!fs.existsSync(pastesDir)) fs.mkdirSync(pastesDir);

// TWO DISCORD WEBHOOKS
const WEBHOOK_NEW = "https://discord.com/api/webhooks/1385570010453381246/uw9Fb39qYBt5GE2l7mkeDaTh5B9KYNqP7mxqfk0WIAK6I829VGEiz-FHI0R1Lp2UbUHb";
const WEBHOOK_DELETE = "https://discord.com/api/webhooks/1386850392205295737/eIgrM-OUeMBN8_jxp7QJzzctXknHnAOLH-voK2-WBBv9hygP5lJQg2HxE9mPbUFuBxac";


// SMART WEBHOOK ROUTER
async function sendWebhook(embed) {
  let url = null;

  switch (embed.eventType) {
    case "paste_created":
      url = WEBHOOK_NEW;
      break;

    case "paste_manually_deleted":
    case "auto_expired":
    case "missing_file":
      url = WEBHOOK_DELETE;
      break;

    default:
      url = WEBHOOK_NEW;
  }

  if (!url) return;

  embed.timestamp = new Date().toISOString();
  embed.footer = { text: `Event: ${embed.eventType}` };

  console.log(`[WEBHOOK] ${embed.eventType}: ${embed.fields?.[0]?.value}`);

  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds: [embed] }),
    });
  } catch (err) {
    console.log("Webhook error:", err);
  }
}

app.use(express.json());
app.use(express.static('public'));


// ===============================
// CREATE NEW PASTE
// ===============================
app.post('/documents', async (req, res) => {
  const { content, expiry, language, redacted, password } = req.body;
  const id = Math.random().toString(36).substr(2, 6);

  const created = Date.now();
  const expires = created + (parseInt(expiry) || 60) * 60 * 1000;

  const passwordHash = password
    ? crypto.createHash('sha256').update(password).digest('hex')
    : null;

  console.log(`[PASTE] Creating paste ${id}`);

  try {
    fs.writeFileSync(path.join(pastesDir, `${id}.txt`), content);
    fs.writeFileSync(
      path.join(pastesDir, `${id}.meta.json`),
      JSON.stringify({ created, expires, language, redacted, passwordHash })
    );

    sendWebhook({
      eventType: "paste_created",
      title: "📄 New Paste Created",
      color: 0x00bfff,
      fields: [
        { name: "Paste ID", value: id, inline: true },
        { name: "Language", value: language || "plain", inline: true },
        { name: "Redacted", value: redacted ? "Yes 🔒" : "No", inline: true },
        { name: "Password", value: passwordHash ? "Yes 🔐" : "No", inline: true },
        { name: "Expiry", value: new Date(expires).toLocaleString() },
        { name: "Link", value: `https://paste.speccynerd.dev/p/${id}` },
      ],
    });

    res.json({ key: id });

  } catch (err) {
    console.error("Failed to save paste:", err);
    res.status(500).json({ error: 'Failed to save paste' });
  }
});


// ===============================
// CLEANUP (EVERY 60 sec)
// ===============================
setInterval(() => {
  const files = fs.readdirSync(pastesDir);
  const now = Date.now();

  files.forEach(file => {
    if (!file.endsWith('.meta.json')) return;

    const id = file.replace('.meta.json', '');
    const metaPath = path.join(pastesDir, file);
    const contentPath = path.join(pastesDir, `${id}.txt`);

    try {

      // CASE 1 — Content missing (manual file delete)
      if (fs.existsSync(metaPath) && !fs.existsSync(contentPath)) {
        console.log(`[CLEANUP] Missing file for ${id}`);

        // FIX: load meta BEFORE using meta.language
        const meta = JSON.parse(fs.readFileSync(metaPath));

        sendWebhook({
          eventType: "missing_file",
          title: "⚠️ Deleted by system (file missing)",
          color: 0xffff00,
          fields: [
            {
              name: "🆔 Paste ID",
              value: id,
              inline: true
            },
            {
              name: "💬 Language",
              value: meta.language || "plaintext",
              inline: true
            }
          ]
        });

        fs.unlinkSync(metaPath);
        return;
      }

      // Load metadata normally
      const meta = JSON.parse(fs.readFileSync(metaPath));

      // CASE 2 — Auto-expired
      if (meta.expires && now > meta.expires) {
        console.log(`[CLEANUP] Auto-expiring ${id}`);

        fs.unlinkSync(metaPath);
        if (fs.existsSync(contentPath)) fs.unlinkSync(contentPath);

        sendWebhook({
          eventType: "auto_expired",
          title: "⏳ Deleted by system (paste expired)",
          color: 0xffa500,
          fields: [
            {
              name: "🆔 Paste ID",
              value: id,
              inline: true
            },
            {
              name: "💬 Language",
              value: meta.language || "plaintext",
              inline: true
            },
            {
              name: "⏰ Expired At",
              value: new Date(meta.expires).toLocaleString()
            }
          ]
        });

      }

    } catch (err) {
      console.log("[CLEANUP] Error:", err);
    }
  });

}, 60 * 1000);


// ===============================
// RAW VIEW (redaction-safe)
// ===============================
app.all('/raw/:id', (req, res) => {
  const id = req.params.id;

  const metaPath = path.join(pastesDir, `${id}.meta.json`);
  const contentPath = path.join(pastesDir, `${id}.txt`);

  if (!fs.existsSync(metaPath) || !fs.existsSync(contentPath)) {
    return res.status(404).send("Not found");
  }

  const meta = JSON.parse(fs.readFileSync(metaPath));

  if (Date.now() > meta.expires) {
    fs.unlinkSync(metaPath);
    if (fs.existsSync(contentPath)) fs.unlinkSync(contentPath);
    return res.status(410).send("Expired");
  }

  if (meta.passwordHash) {
    const provided = req.method === "POST" && req.body?.password
      ? crypto.createHash("sha256").update(req.body.password).digest('hex')
      : null;

    if (provided !== meta.passwordHash) {
      return res.status(401).send("Unauthorized: password required");
    }
  }

  let text = fs.readFileSync(contentPath, "utf8");

  if (meta.redacted) {
    text = text.replace(
      /\b\d{1,3}(?:\.\d{1,3}){3}\b|(?:token|api[_-]?key|authorization)[:=]?\s*["']?[a-z0-9\-_\.]{16,}["']?/gi,
      "[REDACTED]"
    );
  }

  res.type("text/plain").send(text);
});


// ===============================
// META
// ===============================
app.get('/meta/:id', (req, res) => {
  const id = req.params.id;

  const metaPath = path.join(pastesDir, `${id}.meta.json`);
  if (!fs.existsSync(metaPath)) return res.status(404).send('Meta not found');

  const meta = JSON.parse(fs.readFileSync(metaPath));

  if (Date.now() > meta.expires) {
    const contentPath = path.join(pastesDir, `${id}.txt`);
    if (fs.existsSync(contentPath)) fs.unlinkSync(contentPath);
    fs.unlinkSync(metaPath);
    return res.status(410).send('Paste expired');
  }

  res.json(meta);
});


// ===============================
// PASSWORD VALIDATION
// ===============================
app.post('/validate-password/:id', (req, res) => {
  const id = req.params.id;
  const metaPath = path.join(pastesDir, `${id}.meta.json`);

  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'Meta not found' });
  }

  const meta = JSON.parse(fs.readFileSync(metaPath));
  const passwordHash = meta.passwordHash;

  const provided = req.body.password
    ? crypto.createHash('sha256').update(req.body.password).digest('hex')
    : null;

  if (!passwordHash)
    return res.status(400).json({ error: 'This paste does not require a password' });

  if (passwordHash === provided)
    return res.status(200).json({ success: true });

  return res.status(401).json({ error: 'Incorrect password' });
});


// ===============================
// VIEW PAGE
// ===============================
app.get('/p/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// ===============================
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
