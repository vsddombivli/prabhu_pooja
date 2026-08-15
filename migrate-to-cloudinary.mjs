// migrate-to-cloudinary.mjs
//
// One-time script: copies every kid/gift photo currently sitting in
// Supabase Storage over to Cloudinary, then rewrites `photo_url` in the
// `kids` and `gifts` tables to point at the new Cloudinary URL.
//
// SETUP
//   npm init -y
//   npm install @supabase/supabase-js node-fetch form-data ws
//
// RUN
//   SUPABASE_URL=https://nyytdgrmwleemfaiaeqw.supabase.co \
//   SUPABASE_SERVICE_ROLE_KEY=xxxxx \
//   CLOUDINARY_CLOUD_NAME=ixycuksb \
//   CLOUDINARY_PRESET_KIDS=tqexowaz \
//   CLOUDINARY_PRESET_GIFTS=yh6s2mpr \
//   node migrate-to-cloudinary.mjs
//
// NOTE: Use the SERVICE ROLE key (Project Settings -> API), not the anon
// key, since we need to read/update every row regardless of RLS, and
// download files directly from Storage. Never expose this key in the app.

// Polyfill WebSocket for Node < 22 (supabase-js's realtime module expects
// a global WebSocket even though this script never uses realtime).
import WebSocket from 'ws';
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

// Fix for a common Node.js "fetch failed" issue: Node's fetch (undici)
// tries IPv6 first, and on many networks IPv6 routing to a host silently
// fails even though IPv4 (what `curl` uses by default) works fine.
// Forcing IPv4-first resolution fixes this in most cases.
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import FormData from 'form-data';

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_PRESET_KIDS,
  CLOUDINARY_PRESET_GIFTS,
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !CLOUDINARY_CLOUD_NAME) {
  console.error('Missing required env vars. See header comment for the full list.');
  process.exit(1);
}

// Sanity check: catch empty/whitespace-only keys and obvious anon-key mixups
// before making any network calls.
console.log('SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_SERVICE_ROLE_KEY length:', SUPABASE_SERVICE_ROLE_KEY.trim().length, '(should be several hundred chars)');
if (SUPABASE_SERVICE_ROLE_KEY.trim().length < 100) {
  console.error('SUPABASE_SERVICE_ROLE_KEY looks too short/empty — did the env var actually get set? See troubleshooting steps in the chat.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function preflightCheck() {
  console.log('\nRunning network preflight check against Supabase...');
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY },
    });
    console.log('Preflight OK — HTTP status:', res.status);
  } catch (e) {
    console.error('Preflight FAILED. Raw error below — this tells us the real cause:');
    console.error(e);
    if (e.cause) console.error('cause:', e.cause);
    console.error('\nCommon fixes:');
    console.error('  - You are behind a corporate VPN / firewall / antivirus with SSL inspection -> try a different network (e.g. mobile hotspot).');
    console.error('  - Node version issue -> try `node -v` (use Node 18 or 20 LTS).');
    console.error('  - Corporate proxy required -> set HTTPS_PROXY env var to your proxy URL.');
    process.exit(1);
  }
}

async function uploadToCloudinary(buffer, folder, preset) {
  const form = new FormData();
  form.append('file', buffer, { filename: 'photo.jpg', contentType: 'image/jpeg' });
  form.append('upload_preset', preset);
  form.append('folder', folder);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const data = await res.json();
  if (!res.ok || !data.secure_url) throw new Error(data?.error?.message || 'Cloudinary upload failed');
  return data.secure_url;
}

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function migrateTable(table, folder, preset) {
  console.log(`\n=== Migrating ${table} ===`);
  const { data: rows, error } = await sb
    .from(table)
    .select('id, photo_url')
    .not('photo_url', 'is', null);
  if (error) {
    console.error(`Failed to fetch ${table}:`, error.message);
    if (error.cause) console.error('  Underlying cause:', error.cause);
    return;
  }

  console.log(`Found ${rows.length} rows with a photo.`);
  let migrated = 0, skipped = 0, failed = 0;

  for (const row of rows) {
    // Skip anything that's already a Cloudinary URL (idempotent re-runs).
    if (row.photo_url.includes('res.cloudinary.com')) { skipped++; continue; }
    // Only touch Supabase-storage-hosted URLs.
    if (!row.photo_url.includes('supabase.co/storage')) { skipped++; continue; }

    try {
      const buffer = await downloadFile(row.photo_url);
      const newUrl = await uploadToCloudinary(buffer, folder, preset);
      const { error: updErr } = await sb.from(table).update({ photo_url: newUrl }).eq('id', row.id);
      if (updErr) throw updErr;
      migrated++;
      console.log(`  ✓ ${table} ${row.id} -> ${newUrl}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${table} ${row.id} failed:`, e.message);
    }
  }

  console.log(`${table}: migrated=${migrated} skipped=${skipped} failed=${failed}`);
}

async function main() {
  await preflightCheck();
  await migrateTable('kids', 'prabhu-pooja/kids', CLOUDINARY_PRESET_KIDS);
  await migrateTable('gifts', 'prabhu-pooja/gifts', CLOUDINARY_PRESET_GIFTS);
  console.log('\nDone. Spot-check a few photo_url values in Supabase before deleting the old buckets.');
}

main();
