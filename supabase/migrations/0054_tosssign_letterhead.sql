-- TossSign written templates can carry the TOSS letterhead on every page (logo, orange corners,
-- company name and the document title, footer with page numbers).
alter table public.tms_sign_templates add column if not exists letterhead boolean not null default false;
notify pgrst, 'reload schema';
