// 以 Google Imagen 3 圖片端點處理「以圖生圖」：把使用者上傳的人像 + 風格提示 => 產生新頭像。
// 注意：這是 Google "Images" 路徑，不是 generateContent。
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, prompt = '', strength = 70 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: 'missing imageBase64' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'missing GEMINI_API_KEY' });

    // Imagen 3: image-to-image（使用者圖片 + 文字提示）
    // 注意：這是 "Images API" 的 generateImages 端點，與 generateContent 不同。
    const model = process.env.GOOGLE_IMAGE_MODEL || 'imagen-3.0';
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateImages?key=${apiKey}`;

    const body = {
      // 加一點強度參數做風格化權重（後端做 0~1 正規化）
      // 部分版本欄位名稱會叫 guidance/temperature/strength，這裡用 common 欄位 name，後端會忽略未知欄位
      // 主要依 prompt 來導引。
      prompt: { text: `${prompt}（風格強度 ${strength}/100）` },
      image: { mimeType: 'image/png', data: imageBase64 },
      // 有些區域版需要指定 "outputMimeType": "image/png"
      outputMimeType: 'image/png'
    };

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const j = await r.json();

    // 不同地區/版本欄位名稱稍有差異，下面做寬鬆解析
    const b64 =
      j?.images?.[0]?.bytesBase64Encoded ||
      j?.generatedImages?.[0]?.bytesBase64Encoded ||
      j?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data)?.inlineData?.data ||
      null;

    if (!r.ok) {
      // 把 Google 的錯誤往外回給前端看
      return res.status(r.status).json({ error: j?.error?.message || JSON.stringify(j) });
    }
    if (!b64) {
      return res.status(500).json({ error: 'no image in response (check model quota/region)' });
    }
    return res.status(200).json({ imageBase64: b64 });
  } catch (e) {
    console.error('[ai-avatar]', e);
    return res.status(500).json({ error: e?.message || 'server error' });
  }
}
