// /api/ai-avatar.js
import { GoogleGenerativeAI } from "@google/generative-ai";

/** 把 dataURL 轉成純 base64（若本來就純 base64 也可） */
function stripDataUrl(input = "") {
  const i = String(input);
  const idx = i.indexOf("base64,");
  return idx >= 0 ? i.slice(idx + 7) : i;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64, prompt, strength } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "missing imageBase64" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "server missing GEMINI_API_KEY" });

    const modelName = process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash-preview-image";
    const b64 = stripDataUrl(imageBase64);
    const fullPrompt =
      `${prompt || "將人像轉為可愛插畫風格，保留臉部特徵，圓形裁切，透明背景。"}（風格強度：${Number(strength ?? 70)}）`;

    const genAI = new GoogleGenerativeAI(apiKey);

    // --- A) Imagen 3 路線（用 generateImages）---
    if (/imagen/i.test(modelName)) {
      const model = genAI.getGenerativeModel({ model: modelName });

      // 有些 SDK 版本才有 generateImages；沒有就提示換 Gemini 或升級 SDK
      if (typeof model.generateImages !== "function") {
        return res.status(400).json({
          error:
            "This SDK/version does not support Imagen 3 via generateImages. " +
            "Use a Gemini image-generation model (e.g. gemini-2.0-flash-preview-image) " +
            "or upgrade @google/generative-ai."
        });
      }

      const resp = await model.generateImages({
        prompt: fullPrompt,
        // 以圖生圖參考：有的版本叫 image / 有的叫 referenceImages
        image: { inlineData: { mimeType: "image/png", data: b64 } }
        // 你也可以加 aspectRatio: "1:1" 等參數（若模型支援）
      });

      // 兼容不同回傳格式
      const out =
        resp?.images?.[0]?.data ||
        resp?.response?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data)?.inlineData?.data;

      if (!out) return res.status(500).json({ error: "no image in response (imagen)" });
      return res.status(200).json({ imageBase64: out });
    }

    // --- B) Gemini image-generation 路線（用 generateContent + 指定回傳 PNG）---
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            { text: fullPrompt },
            { inlineData: { mimeType: "image/png", data: b64 } } // 以圖生圖
          ]
        }
      ],
      generationConfig: {
        // 關鍵：要求回傳影像，不然伺服器會當成要 TEXT → 400
        responseMimeType: "image/png"
      }
    });

    const part = result?.response?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data);
    const out = part?.inlineData?.data;
    if (!out) return res.status(500).json({ error: "no image in response (gemini)" });

    return res.status(200).json({ imageBase64: out });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "server error" });
  }
}
