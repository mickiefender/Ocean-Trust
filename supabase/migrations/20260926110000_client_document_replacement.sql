create policy client_documents_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'client-documents'
  and public.current_user_is_admin()
);
