
// GENERATE RPP - e-GEPAI
// Fitur: retry otomatis dan model Gemini cadangan

const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

function parseJsonSafely(raw) {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return null;
  }
}

function getGeminiError(data, status) {
  return data?.error?.message ||
    `Gemini API gagal memproses permintaan (HTTP ${status}).`;
}

function isRetryableError(status, message = '') {
  if ([500, 502, 503, 504].includes(status)) {
    return true;
  }

  if (status === 429) {
    const msg = String(message).toLowerCase();

    return (
      msg.includes('rate_limit') ||
      msg.includes('too_many_requests') ||
      msg.includes('per minute') ||
      msg.includes('per-minute') ||
      msg.includes('requests per')
    );
  }

  return false;
}

export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method tidak diizinkan.'
    });
  }

  const body = req.body || {};
  const prompt = body.prompt;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({
      error: 'Prompt belum dikirim.'
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY belum dipasang di Vercel.'
    });
  }

  // MODEL UTAMA
  const primaryModel =
    process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

  // MODEL CADANGAN
  const fallbackModels = (
    process.env.GEMINI_FALLBACK_MODELS ||
    'gemini-3.1-flash-lite'
  )
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);

  const models = [
    ...new Set([primaryModel, ...fallbackModels])
  ];

  let lastStatus = 503;
  let lastMessage = 'Layanan Gemini sedang sibuk.';
  let lastModel = primaryModel;

  // COBA MODEL UTAMA DAN CADANGAN
  for (
    let modelIndex = 0;
    modelIndex < models.length;
    modelIndex += 1
  ) {

    const model = models[modelIndex];
    lastModel = model;

    // Model utama dicoba 2 kali.
    // Model cadangan dicoba 1 kali.
    const attemptsForModel =
      modelIndex === 0 ? 2 : 1;

    for (
      let attempt = 0;
      attempt < attemptsForModel;
      attempt += 1
    ) {

      let response;

      try {

        const url =
          `https://generativelanguage.googleapis.com/v1beta/models/` +
          `${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

        response = await fetch(url, {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json'
          },

          body: JSON.stringify({
            contents: [
              {
                role: 'user',
                parts: [
                  { text: prompt }
                ]
              }
            ],

            generationConfig: {
              maxOutputTokens: 12000
            }
          })
        });

      } catch (error) {

        lastStatus = 502;

        lastMessage =
          error?.message ||
          'Tidak dapat terhubung ke layanan Gemini.';

        if (attempt + 1 < attemptsForModel) {
          await sleep(900 * (attempt + 1));
          continue;
        }

        break;
      }

      const raw = await response.text();
      const data = parseJsonSafely(raw);

      if (!data) {

        lastStatus = 502;
        lastMessage =
          'Gemini mengembalikan respons yang tidak valid.';

        break;
      }

      // JIKA BERHASIL
      if (response.ok) {

        const text = (data?.candidates || [])
          .flatMap(
            (candidate) =>
              candidate?.content?.parts || []
          )
          .map((part) => part?.text || '')
          .join('')
          .trim();

        if (!text) {
          return res.status(502).json({
            error:
              'Gemini tidak mengembalikan teks RPP. Silakan coba kembali.'
          });
        }

        return res.status(200).json({
          text,
          model
        });
      }

      lastStatus = response.status;

      lastMessage = getGeminiError(
        data,
        response.status
      );

      // JIKA ERROR BUKAN GANGGUAN SEMENTARA
      // LANGSUNG TAMPILKAN ERROR
      if (!isRetryableError(
        response.status,
        lastMessage
      )) {

        return res.status(response.status).json({
          error: lastMessage
        });
      }

      // JEDA SEBELUM COBA ULANG
      if (attempt + 1 < attemptsForModel) {

        await sleep(
          900 * (2 ** attempt)
        );

      }

    }

    // JIKA MODEL UTAMA GAGAL,
    // LANJUT KE MODEL CADANGAN
  }

  console.error('Semua model Gemini gagal:', {
    status: lastStatus,
    model: lastModel,
    message: lastMessage
  });

  const isTemporaryFailure =
    [500, 502, 503, 504].includes(lastStatus);

  return res.status(lastStatus).json({
    error: isTemporaryFailure
      ? 'Layanan AI Gemini sedang padat. Sistem sudah mencoba ulang dan mencoba model cadangan, tetapi belum berhasil. Silakan tunggu sebentar lalu klik “Buat RPP/Modul Ajar” kembali.'
      : lastMessage
  });

}
