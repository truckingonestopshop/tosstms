-- Fix for 0023: the credentials view was rebuilt from the early definition (decrypting with
-- vault_key() directly, as the owner) and lost security_invoker, so members got "permission
-- denied for function vault_key". Back to the 0001 section 15 design (decrypt through the
-- member-checked vault_decrypt(), run as the caller), with the dispatch-only filter. TMS only.
create or replace view public.tms_vault_items as
  select v.id, v.company_id, v.category, v.title, v.url, v.username,
         tms_private.vault_decrypt(v.password_enc) as password,
         v.account_number, v.contact_name, v.contact_email, v.contact_phone, v.role_title,
         v.notes, v.custom_fields, v.sort_order, v.created_at, v.updated_at, v.dispatch_only
  from tms_private.vault_items v
  where tms_private.is_member() and (not v.dispatch_only or tms_private.sees_dispatch());
revoke all on public.tms_vault_items from public, anon;
grant select, insert, update, delete on public.tms_vault_items to authenticated;
alter view public.tms_vault_items set (security_invoker = true);
notify pgrst, 'reload schema';
