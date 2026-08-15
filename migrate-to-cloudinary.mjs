// migrate-to-cloudinary.mjs
//
// One-time script: copies every kid/gift photo currently sitting in
// Supabase Storage over to Cloudinary, then rewrites `photo_url` in the
// `kids` and `gifts` tables to point at the new Cloudinary URL.
//
// SETUP
//   npm init -y
//   npm install @supabase/supabase-js node-fetch form-data
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

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
  if (error) { console.error(`Failed to fetch ${table}:`, error.message); return; }

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
  await migrateTable('kids', 'prabhu-pooja/kids', CLOUDINARY_PRESET_KIDS);
  await migrateTable('gifts', 'prabhu-pooja/gifts', CLOUDINARY_PRESET_GIFTS);
  console.log('\nDone. Spot-check a few photo_url values in Supabase before deleting the old buckets.');
}

main();
