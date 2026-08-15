// Supabase Edge Function: cloudinary-delete
// Deletes an image from Cloudinary using the Admin API (signed request).
// The API secret never touches the browser — it lives only in this function's
// environment as a Supabase secret.
//
// Deploy:
//   supabase functions deploy cloudinary-delete --project-ref <YOUR_PROJECT_REF>
//
// Set secrets (once):
//   supabase secrets set CLOUDINARY_CLOUD_NAME=ixycuksb --project-ref <YOUR_PROJECT_REF>
//   supabase secrets set CLOUDINARY_API_KEY=xxxxxxxx --project-ref <YOUR_PROJECT_REF>
//   supabase secrets set CLOUDINARY_API_SECRET=xxxxxxxx --project-ref <YOUR_PROJECT_REF>
//
// Get API key + secret from: Cloudinary Dashboard -> Settings -> API Keys

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLOUD_NAME  = Deno.env.get("CLOUDINARY_CLOUD_NAME")!;
const API_KEY     = Deno.env.get("CLOUDINARY_API_KEY")!;
const API_SECRET  = Deno.env.get("CLOUDINARY_API_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha1Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    // 1. Require a logged-in Supabase user (any authenticated role).
    //    This stops random internet users from burning your Cloudinary quota.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 2. Parse the public_id to delete.
    const { public_id } = await req.json();
    if (!public_id || typeof public_id !== "string") {
      return new Response(JSON.stringify({ error: "public_id is required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // 3. Build Cloudinary's signed destroy request.
    const timestamp = Math.floor(Date.now() / 1000);
    const paramsToSign = `public_id=${public_id}&timestamp=${timestamp}${API_SECRET}`;
    const signature = await sha1Hex(paramsToSign);

    const form = new FormData();
    form.append("public_id", public_id);
    form.append("timestamp", String(timestamp));
    form.append("api_key", API_KEY);
    form.append("signature", signature);

    const cdRes = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/destroy`,
      { method: "POST", body: form }
    );
    const cdData = await cdRes.json();

    return new Response(JSON.stringify(cdData), {
      status: cdRes.ok ? 200 : 502,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});
