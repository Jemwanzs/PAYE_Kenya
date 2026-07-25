-- Adds an optional business logo, uploaded (or auto-fetched from a
-- pasted URL) and stored in a public Supabase Storage bucket, then
-- referenced by URL from payroll_settings. Printed on the payslip,
-- muster roll, and leave balances report alongside the business name.
-- Safe to run against the live project (additive only).

alter table public.payroll_settings
  add column if not exists business_logo_url text;

insert into storage.buckets (id, name, public)
values ('business-logos', 'business-logos', true)
on conflict (id) do nothing;

-- Logos are printed via plain <img> tags in generated print HTML, so
-- the bucket must serve them without an auth header -- public read.
create policy "business_logos_public_read"
  on storage.objects for select
  to public
  using (bucket_id = 'business-logos');

-- Writes are scoped to a folder named after the uploader's own user id
-- (object path convention: {user_id}/logo.png), so one business can
-- never overwrite or delete another's logo.
create policy "business_logos_owner_write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_logos_owner_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "business_logos_owner_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'business-logos' and (storage.foldername(name))[1] = auth.uid()::text);
