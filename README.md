# prabhu_pooja
Prabhu Pooja

How to Migrate All storage media of supabase to cloudinary:-
Here's the full walkthrough, assuming you're starting from scratch:

## Step 1: Install Node.js (if not already installed)
Check first:
```
node -v
```
If that errors or shows nothing, download and install Node.js LTS from https://nodejs.org (just click through the installer). Then re-check with `node -v` — should show something like `v20.x.x`.

## Step 2: Set up a folder for the script
```
mkdir cloudinary-migration
cd cloudinary-migration
```
Put the `migrate-to-cloudinary.mjs` file (that I gave you) inside this folder.

## Step 3: Install the required packages
Inside that folder, run:
```
npm init -y
npm install @supabase/supabase-js node-fetch form-data
```
This creates a `node_modules` folder and `package.json` — normal, leave them.

## Step 4: Get your Supabase Service Role Key
- Go to your Supabase project → **Project Settings → API**.
- Copy the **`service_role`** key (⚠️ NOT the anon/public key — this one bypasses RLS, so never put it in your app code or share it publicly. It's only used here, once, from your own computer).
- Also copy your **Project URL** from the same page (e.g. `https://nyytdgrmwleemfaiaeqw.supabase.co`).

## Step 5: Run the script with your values

**On Mac/Linux (Terminal):**
```bash
SUPABASE_URL=https://nyytdgrmwleemfaiaeqw.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=paste_your_service_role_key_here \
CLOUDINARY_CLOUD_NAME=ixycuksb \
CLOUDINARY_PRESET_KIDS=tqexowaz \
CLOUDINARY_PRESET_GIFTS=yh6s2mpr \
node migrate-to-cloudinary.mjs
```

**On Windows (PowerShell):**
```powershell
$env:SUPABASE_URL="https://nyytdgrmwleemfaiaeqw.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="paste_your_service_role_key_here"
$env:CLOUDINARY_CLOUD_NAME="ixycuksb"
$env:CLOUDINARY_PRESET_KIDS="tqexowaz"
$env:CLOUDINARY_PRESET_GIFTS="yh6s2mpr"
node migrate-to-cloudinary.mjs
```

**On Windows (Command Prompt / cmd):**
```cmd
set SUPABASE_URL=https://nyytdgrmwleemfaiaeqw.supabase.co
set SUPABASE_SERVICE_ROLE_KEY=paste_your_service_role_key_here
set CLOUDINARY_CLOUD_NAME=ixycuksb
set CLOUDINARY_PRESET_KIDS=tqexowaz
set CLOUDINARY_PRESET_GIFTS=yh6s2mpr
node migrate-to-cloudinary.mjs
```

## Step 6: Watch the output
You'll see lines like:
```
=== Migrating kids ===
Found 42 rows with a photo.
  ✓ kids abc123 -> https://res.cloudinary.com/ixycuksb/...
kids: migrated=42 skipped=0 failed=0

=== Migrating gifts ===
...
```
If any row fails, it'll print the error but continue with the rest — you can just re-run the script afterward and it'll skip everything already migrated.

## Step 7: Verify
Open your Supabase table editor → check a few `photo_url` values in `kids` and `gifts` now start with `https://res.cloudinary.com/...`. Also open a couple of those URLs in the browser to confirm the images load.

Once you've confirmed everything looks right, you're safe to delete the old `kid-photos`/`gift-photos` buckets from Supabase Storage.
