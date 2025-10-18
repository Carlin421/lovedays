// /api/upload-avatar
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { imageBase64, filename, payload, hash: clientHash } = req.body || {};
    if (!imageBase64 || !filename) return res.status(400).json({ error: "missing params" });

    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // 僅後端使用
    );
    const bucket = process.env.AVATAR_BUCKET || "avatars";

    // 取得 buffer 與 hash（若前端已算好 hash 也可直接用）
    const buffer = Buffer.from(imageBase64, "base64");
    const hash = clientHash || crypto.createHash("sha256").update(buffer).digest("hex");

    // 以內容雜湊做唯一檔名：by-hash/<hash>.png
    const canonicalKey = `by-hash/${hash}.png`;

    // 嘗試上傳；若已存在，就直接視為重用
    let reused = false;
    const { error: upErr } = await supa.storage
      .from(bucket)
      .upload(canonicalKey, buffer, { upsert: false, contentType: "image/png" });

    if (upErr) {
      // Supabase 既有檔案會丟 409，或 message 包含 exists
      const msg = (upErr && (upErr.message || upErr.error)) || "";
      if (upErr.statusCode === "409" || /exists/i.test(msg)) {
        reused = true;
      } else {
        throw upErr;
      }
    }

    // 拿公開網址（存在或剛上傳都一樣）
    const { data: pub } = supa.storage.from(bucket).getPublicUrl(canonicalKey);
    const publicUrl = pub?.publicUrl;

    // 寫入/更新 couples 資料（A/B 由 filename 決定）
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

      const { error: dbErr } = await supa.from("couples").upsert(row, { onConflict: "slug" });
      if (dbErr) throw dbErr;
    }

    return res.status(200).json({ publicUrl, hash, reused });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
