const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const https = require('https');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ===== KEYS =====
const ELK = 'sk_c58931489f2326f98062459106f727162a3e976536c1b19b';
const CTK = '4e1e2677-3a30-43d1-bc7a-b53b788af88a';
const PXK = 'WlZ1HFiyRp4UnMwICopXMZR9MpxWP8okfrdkuwiRjCwtEKEKQEmLrOAv';
const PBK = '55940388-60efa383ffa90e913f66f5477';
const CK  = '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';
const EL_VOICES = { ar:'uYFJyGaibp4N2VwYQshk', en:'s3TPKV1kjDlVtZbl4Ksh', fr:'93nuHbke4dTER9x2pDwE' };

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ===== SCRIPT via Claude =====
app.post('/api/script', async (req, res) => {
  try {
    const { topic, type, duration, lang } = req.body;
    const types = { educational:'تعليمي', motivational:'تحفيزي', storytelling:'قصصي', tips:'نصائح' };
    const ls = { ar:'باللغة العربية', en:'in English', fr:'en français' };

    const prompt = `أنت كاتب سكريبت فيديو محترف. اكتب ${ls[lang]||ls.ar}.
الموضوع: ${topic}
النوع: ${types[type]||'تعليمي'}
المدة: ${duration} ثانية (~${Math.round(duration/60*140)} كلمة)
القواعد:
- ابدأ بجملة قوية تجذب الانتباه فوراً
- نص طبيعي للنطق فقط بلا رموز أو تعليمات
- اختم بـ call-to-action قوي
السكريبت فقط:`;

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': CK,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!r.ok) throw new Error('Claude error: ' + r.status);
    const d = await r.json();
    const script = d.content?.[0]?.text || '';
    res.json({ script });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== VOICE via ElevenLabs =====
app.post('/api/voice', async (req, res) => {
  try {
    const { text, lang } = req.body;
    const voiceId = EL_VOICES[lang] || EL_VOICES.ar;

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELK,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0, use_speaker_boost: true }
      })
    });

    if (!r.ok) {
      const err = await r.text();
      throw new Error('ElevenLabs ' + r.status + ': ' + err);
    }

    const buf = await r.buffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SEARCH MEDIA — Pexels Videos =====
app.get('/api/media/videos', async (req, res) => {
  try {
    const { query, orientation, per_page = 6 } = req.query;
    const r = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=${per_page}&orientation=${orientation}`,
      { headers: { Authorization: PXK } }
    );
    if (!r.ok) throw new Error('Pexels videos ' + r.status);
    const d = await r.json();
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SEARCH MEDIA — Pexels Photos =====
app.get('/api/media/photos', async (req, res) => {
  try {
    const { query, orientation, per_page = 8 } = req.query;
    const r = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${per_page}&orientation=${orientation}`,
      { headers: { Authorization: PXK } }
    );
    if (!r.ok) throw new Error('Pexels photos ' + r.status);
    const d = await r.json();
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SEARCH MEDIA — Pixabay =====
app.get('/api/media/pixabay', async (req, res) => {
  try {
    const { query, orientation } = req.query;
    const pbOrient = orientation === 'portrait' ? 'vertical' : 'horizontal';
    const r = await fetch(
      `https://pixabay.com/api/?key=${PBK}&q=${encodeURIComponent(query)}&image_type=photo&per_page=8&min_width=640&orientation=${pbOrient}`
    );
    if (!r.ok) throw new Error('Pixabay ' + r.status);
    const d = await r.json();
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== CREATE VIDEO — Creatomate =====
app.post('/api/video/create', async (req, res) => {
  try {
    const body = req.body;
    const r = await fetch('https://api.creatomate.com/v1/renders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CTK}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message || 'Creatomate ' + r.status);
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== RENDER STATUS — Creatomate =====
app.get('/api/video/status/:id', async (req, res) => {
  try {
    const r = await fetch(`https://api.creatomate.com/v1/renders/${req.params.id}`, {
      headers: { 'Authorization': `Bearer ${CTK}` }
    });
    const d = await r.json();
    res.json(d);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== SERVE FRONTEND =====
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
