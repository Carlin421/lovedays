import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64, filename, payload } = req.body || {};
    if (!imageBase64 || !filename) return res.status(400).json({ error: "missing params" });

    const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    const bucket = process.env.AVATAR_BUCKET || "avatars";
    const buffer = Buffer.from(imageBase64, "base64");

    // 1) 儲存檔案：不覆蓋
    let upErr = null;
    const { error } = await supa.storage.from(bucket).upload(filename, buffer, {
      upsert: false, contentType: "image/png"
    });
    upErr = error;

    // 如果檔案已存在就忽略（沿用舊的），其他錯誤才報
    if (upErr && !/already exists|resource already exists/i.test(upErr.message)) {
      return res.status(500).json({ error: upErr.message || "upload failed" });
    }

    const { data: pub } = supa.storage.from(bucket).getPublicUrl(filename);
    const publicUrl = pub?.publicUrl;

    // 2) 資料表：只 insert，不 upsert；已存在就忽略
    if (payload?.slug) {
      const row = {
        slug: payload.slug,
        name_a: payload.name_a || null,
        name_b: payload.name_b || null,
        start_date: payload.start_date || null,
        is_public: true,
      };
      if (filename.endsWith("-A.png")) row.photo_a_url = publicUrl;
      if (filename.endsWith("-B.png")) row.photo_b_url = publicUrl;

      const { error: insErr } = await supa.from("couples").insert(row);
      // 唯一鍵衝突（slug 已存在）就不當錯
      if (insErr && insErr.code !== "23505") {
        return res.status(500).json({ error: insErr.message || "db insert failed" });
      }
    }

    // 若剛好是「檔案已存在」的情況，讓前端也能順利拿到 URL
    const status = upErr ? 409 : 200;
    return res.status(status).json({ publicUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
