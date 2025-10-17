// /api/upload-avatar.js
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res){
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try{
    const { imageBase64, filename, payload } = req.body || {};
    if (!imageBase64 || !filename) return res.status(400).json({ error: "missing image or filename" });

    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY; // 只後端使用
    if (!url || !key) return res.status(500).json({ error: "missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" });

    const supa = createClient(url, key);
    const buffer = Buffer.from(imageBase64, "base64");

    const { error: upErr } = await supa.storage.from("avatars").upload(filename, buffer, {
      upsert: true, contentType: "image/png"
    });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from("avatars").getPublicUrl(filename);
    const publicUrl = pub?.publicUrl;

    if (payload) {
      const row = { ...payload };
      if (filename.endsWith("-A.png")) row.photo_a_url = publicUrl;
      if (filename.endsWith("-B.png")) row.photo_b_url = publicUrl;
      const { error: dbErr } = await supa.from("couples").upsert(row, { onConflict: "slug" });
      if (dbErr) throw dbErr;
    }
    res.status(200).json({ publicUrl });
  }catch(e){
    console.error(e);
    res.status(500).json({ error: e.message || "server error" });
  }
}
