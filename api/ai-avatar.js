import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { imageBase64, prompt, strength } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "missing imageBase64" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "server missing GEMINI_API_KEY" });

    const genAI = new GoogleGenerativeAI(apiKey);
    // 你帳號可用的影像模型：預設 'imagen-3.0'；也可改為可用的 Gemini 圖像型號
    const modelName = process.env.GEMINI_IMAGE_MODEL || "imagen-3.0";
    const model = genAI.getGenerativeModel({ model: modelName });

    // strength 可選：不同模型不一定支援；保留在 prompt 作軟控制
    const fullPrompt = `${prompt || "將人像轉為可愛插畫風格，保留臉部特徵，圓形裁切，透明背景。"}（風格強度：${Number(strength ?? 70)}）`;

    const result = await model.generateContent([
      { text: fullPrompt },
      { inlineData: { mimeType: "image/png", data: imageBase64 } }
    ]);

    const imgPart =
      result?.response?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data);
    const b64 = imgPart?.inlineData?.data;
    if (!b64) return res.status(500).json({ error: "no image in response" });

    return res.status(200).json({ imageBase64: b64 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "server error" });
  }
}
