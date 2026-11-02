-- Written templates: a document typed in TOSS Cloud (letterhead, text, tables, images) with
-- {{merge}} values and signer fields placed in the text. It becomes a PDF when it's sent, so it
-- has no file until then. Uploaded-PDF templates are kind 'pdf' (as before).

alter table public.tms_sign_templates add column if not exists kind text not null default 'pdf';
alter table public.tms_sign_templates drop constraint if exists tms_sign_templates_kind_check;
alter table public.tms_sign_templates add constraint tms_sign_templates_kind_check check (kind in ('pdf', 'written'));
-- the written document (HTML)
alter table public.tms_sign_templates add column if not exists body text;
alter table public.tms_sign_templates alter column file_path drop not null;
alter table public.tms_sign_templates alter column file_name drop not null;

notify pgrst, 'reload schema';
