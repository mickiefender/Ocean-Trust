insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

create policy client_documents_storage_read
on storage.objects for select to authenticated
using (bucket_id = 'client-documents');

create policy client_documents_storage_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'client-documents');
