-- Storage bucket configuration for avatars
-- Authenticated users can upload and manage their own avatar

-- Note: Storage buckets are typically created via Supabase CLI/dashboard
-- This migration documents the required bucket and its policies.
-- If using supabase/config.toml, add:
--
-- [[storage.buckets]]
-- name = "avatars"
-- public = false
-- file_size_limit = 5242880  -- 5 MB
-- allowed_mime_types = ["image/png", "image/jpeg", "image/webp"]

-- ============================================================================
-- Storage Bucket: avatars
-- ============================================================================
-- Create the avatars storage bucket if it doesn't exist
-- Note: This may need to be done via Supabase dashboard or CLI instead
-- insert into storage.buckets (id, name, public, file_size_limit)
-- values ('avatars', 'avatars', false, 5242880)
-- on conflict (id) do nothing;

-- ============================================================================
-- Storage Policies for avatars bucket
-- ============================================================================
-- NOTE: Supabase storage policies are applied at the bucket level via RLS.
-- These policies assume the path format: {userId}/avatar.webp
-- 
-- To enable these policies, you must:
-- 1. Create the avatars bucket in Supabase
-- 2. Run: ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
-- 3. Apply these policies
--
-- Alternatively, use the Supabase dashboard Storage RLS editor.

-- Users can read all avatar objects (public read for display)
create policy "Avatar objects are publicly readable"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars');

-- Allow anonymous users to read avatars too (for public profiles)
create policy "Avatar objects readable by public"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'avatars');

-- Users can upload their own avatar (path format: {userId}/avatar.webp)
-- The Edge Function (moderate-avatar) validates ownership before allowing updates to profile
create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars' 
    and auth.uid()::text = (string_to_array(name, '/'))[1]
    and name ilike '%/avatar.webp'
  );

-- Users can overwrite their own avatar
create policy "Users can update their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars' 
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  )
  with check (
    bucket_id = 'avatars' 
    and auth.uid()::text = (string_to_array(name, '/'))[1]
    and name ilike '%/avatar.webp'
  );

-- Users can delete their own avatar
create policy "Users can delete their own avatar"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars' 
    and auth.uid()::text = (string_to_array(name, '/'))[1]
  );

-- ============================================================================
-- MANUAL SETUP REQUIRED
-- ============================================================================
-- Due to Supabase CLI limitations, the avatars bucket must be created via:
--
-- 1. Supabase Dashboard:
--    - Go to Storage > New Bucket
--    - Name: avatars
--    - Public: OFF
--    - File size limit: 5 MB (5242880 bytes)
--    - Allowed MIME types: image/png, image/jpeg, image/webp
--
-- 2. Via supabase/config.toml:
--    [[storage.buckets]]
--    name = "avatars"
--    public = false
--    file_size_limit = 5242880
--    allowed_mime_types = ["image/png", "image/jpeg", "image/webp"]
--
-- 3. Via Supabase CLI:
--    supabase storage create avatars --public false
--
-- After creating the bucket, update this migration to verify policies are in place
