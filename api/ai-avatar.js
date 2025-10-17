// /api/ai-avatar.js
import { GoogleGenerativeAI } from "@google/generative-ai";

function stripDataUrl(input = "") {
  const s = String(input);
  const i = s.indexOf("base64,");
  return i >= 0 ? s.slice(i + 7) : s;
}

async function tryGemini(genAI, modelName, promptText, base64) {
  const model = genAI.getGenerativeModel({ model: modelName });
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [
      { text: promptText },
      { inlineData: { mimeType: "image/png", data: base64 } }
    ]}],
    generationConfig: { responseMimeType: "image/png" }
  });
  const part = result?.response?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data);
  return part?.inlineData?.data || null;
}

async function tryImagen(genAI, modelName, promptText, base64) {
  const model = genAI.getGenerativeModel({ model: modelName });
  if (typeof model.generateImages !== "function") {
    throw new Error("SDK doesn't expose generateImages(); use a Gemini image model or upgrade @google/generative-ai.");
  }
  const r = await model.generateImages({
    prompt: promptText,
    image: { inlineData: { mimeType: "image/png", data: base64 } }
  });
  return (
    r?.images?.[0]?.data ||
    r?.response?.candidates?.[0]?.content?.parts?.find(p => p?.inlineData?.data)?.inlineData?.data ||
    null
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { imageBase64, prompt, strength } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "missing imageBase64" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "server missing GEMINI_API_KEY" });

    const base64 = stripDataUrl(imageBase64);
    const fullPrompt = `${prompt || "將人像轉為可愛插畫風格，保留臉部特徵，圓形裁切，透明背景。"}（風格強度：${Number(strength ?? 70)}）`;

    const modelEnv = process.env.GEMINI_IMAGE_MODEL || ""; // 可填 "imagen-3.0" 或你帳戶可用的 Gemini 影像型號
    const genAI = new GoogleGenerativeAI(apiKey);

    let out = null;
    try {
      if (/imagen/i.test(modelEnv)) out = await tryImagen(genAI, modelEnv, fullPrompt, base64);
      else if (modelEnv) out = await tryGemini(genAI, modelEnv, fullPrompt, base64);
    } catch (_) { /* 讓它 fallback */ }

    // Fallback：先試 Imagen，再試 Gemini 常見型號
    if (!out) {
      try { out = await tryImagen(genAI, "imagen-3.0", fullPrompt, base64); } catch (_) {}
    }
    if (!out) {
      for (const m of ["gemini-2.0-flash", "gemini-2.0-pro"]) {
        try { out = await tryGemini(genAI, m, fullPrompt, base64); if (out) break; } catch (_) {}
      }
    }

    if (!out) {
      return res.status(404).json({
        error: "找不到可用的影像模型：請在 Vercel 設定 GEMINI_IMAGE_MODEL（建議 imagen-3.0 或你帳戶可用的 gemini-2.0-*），並重新部署。"
      });
    }
    return res.status(200).json({ imageBase64: out });
  } catch (e) {
    const msg = String(e?.message || "");
    const isKey = /API key expired|API_KEY_INVALID|PERMISSION_DENIED/i.test(msg);
    console.error("[ai-avatar] error:", e);
    return res.status(isKey ? 401 : 500).json({
      error: isKey
        ? "Gemini API 金鑰無效或已過期，請在 Google AI Studio 重新產生金鑰後，更新 Vercel 的 GEMINI_API_KEY 並重新部署。"
        : (msg || "server error")
    });
  }
}
