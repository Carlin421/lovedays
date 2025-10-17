import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { imageBase64, prompt, strength = 70 } = req.body || {};
    if (!imageBase64) return res.status(400).json({ error: "missing imageBase64" });

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_IMAGE_MODEL || "gemini-2.0-flash",
    });

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [
          { text: (prompt || "將人像轉為可愛插畫風格，保留臉部特徵，透明背景。") + `（風格強度 ${strength}/100）` },
          { inlineData: { mimeType: "image/png", data: imageBase64 } },
        ],
      }],
      generationConfig: { responseMimeType: "image/png" },
    });

    const b64 = result?.response?.candidates?.[0]?.content?.parts
      ?.find(p => p?.inlineData?.data)?.inlineData?.data;

    if (!b64) return res.status(500).json({ error: "no image in response" });
    return res.status(200).json({ imageBase64: b64 });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
