TOSS email templates for Supabase
=================================

Where: Supabase -> Authentication -> Emails -> Templates

For each file below:
  1. Open the file (double-click, it opens in Notepad).
  2. Ctrl+A, then Ctrl+C to copy everything.
  3. In Supabase, open the template with the same name.
  4. Set the Subject (below), paste over everything in the body, click Save.

File                       Supabase template      Subject
1 - Invite user            Invite user            You're invited to TOSS
2 - Reset password         Reset password         Reset your TOSS password
3 - Magic link             Magic link             Your TOSS sign-in link
4 - Confirm sign up        Confirm sign up        Confirm your TOSS email

"Change email address" and "Reauthentication" did not change: leave them as they are.

Paste the files exactly as they are. Parts like {{ .SiteURL }} and {{ .TokenHash }}
are filled in by Supabase when the email is sent.
