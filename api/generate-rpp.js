export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  try {
    const body = req.body || {};
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt belum dikirim.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

    if (!apiKey) {
      return res.status(500).json({
        error: 'GEMINI_API_KEY belum dipasang di Vercel.'
      });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.7,
          topP: 0.9,
          maxOutputTokens: 12000
        }
      })
    });

    const raw = await response.text();
    let data = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch (_) {
      return res.status(502).json({
        error: 'Gemini mengembalikan respons yang tidak valid.'
      });
    }

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `Gemini API gagal memproses permintaan (HTTP ${response.status}).`;
      return res.status(response.status).json({ error: message });
    }

    const text = (data?.candidates || [])
      .flatMap(candidate => candidate?.content?.parts || [])
      .map(part => part?.text || '')
      .join('')
      .trim();

    if (!text) {
      return res.status(502).json({
        error: 'Gemini tidak mengembalikan teks RPP.'
      });
    }

    return res.status(200).json({ text });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message || 'Terjadi kesalahan pada server.'
    });
  }
}
