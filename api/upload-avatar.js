import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { imageBase64, filename, payload } = req.body || {};
    if (!imageBase64 || !filename) return res.status(400).json({ error: "missing params" });

    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // 只用在後端
    );
    const bucket = process.env.AVATAR_BUCKET || "avatars";
    const buffer = Buffer.from(imageBase64, "base64");

    const { error: upErr } = await supa
      .storage.from(bucket)
      .upload(filename, buffer, { upsert: true, contentType: "image/png" });
    if (upErr) throw upErr;

    const { data: pub } = supa.storage.from(bucket).getPublicUrl(filename);
    const publicUrl = pub?.publicUrl;

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

    return res.status(200).json({ publicUrl });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e?.message || "server error" });
  }
}
