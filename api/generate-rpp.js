export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method tidak diizinkan.' });
  }

  try {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    const { prompt } = body || {};
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt belum dikirim.' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-5.6';

    if (!apiKey) {
      return res.status(500).json({
        error: 'OPENAI_API_KEY belum dipasang di Vercel → Settings → Environment Variables.'
      });
    }

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input: prompt
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'OpenAI API gagal memproses permintaan.'
      });
    }

    return res.status(200).json({
      text: data.output_text || ''
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || 'Terjadi kesalahan pada server.'
    });
  }
}
