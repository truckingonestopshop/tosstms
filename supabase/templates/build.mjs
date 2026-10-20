// Builds the TOSS sign-in emails that Supabase Auth sends (through Resend SMTP) for both
// TOSS Cloud and TOSS Lead Hunter, from one layout. Run: node supabase/templates/build.mjs
//   supabase/templates/*.html          paste into Supabase → Authentication → Emails → Templates
//   supabase/templates/preview/*.html  the same with sample data, to look at locally
//   public/brand/email-logo.png        the logo the emails load (Gmail doesn't show SVG)
// Buttons go to TOSS Cloud (/auth/confirm → a Continue page), never to Supabase's own verify link:
// they work on any device, don't depend on the Redirect URLs list, and a mail scanner opening
// the link can't use up the one-time code.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const SITE = "https://www.tosscloud.tech";
const LOGO = `${SITE}/brand/email-logo.png`;

// Brand: black text, one orange action (black text on orange), quiet grays.
const C = { ink: "#0a0a0d", text: "#3f3f46", muted: "#71717a", line: "#e4e4e7", bg: "#f4f4f5", card: "#ffffff", orange: "#f28c38" };
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Our confirm page with the one-time code; type is Supabase's verify type. */
const confirmLink = (type, next) => `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}&next=${next}`;

const hi = `{{ if .Data.full_name }}Hi {{ .Data.full_name }},{{ else }}Hi,{{ end }}`;

/** One email: heading, paragraphs, optional button, fine print. Table layout for Outlook. */
function layout({ preheader, heading, body, button, link, after = [], code }) {
  const p = (t, style = "") => `<p style="margin:0 0 16px;font:15px/1.6 ${FONT};color:${C.text};${style}">${t}</p>`;
  const btn = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 28px"><tr><td style="border-radius:999px;background:${C.orange}">
<a href="${link}" style="display:inline-block;padding:13px 26px;font:600 15px/1 ${FONT};color:${C.ink};text-decoration:none;border-radius:999px">${button}</a>
</td></tr></table>`
    : "";
  const codeBox = code
    ? `<div style="margin:8px 0 28px;padding:18px 0;border:1px solid ${C.line};border-radius:12px;text-align:center;font:600 30px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:8px;color:${C.ink}">{{ .Token }}</div>`
    : "";
  const fallback = button
    ? `<p style="margin:0 0 6px;font:13px/1.6 ${FONT};color:${C.muted}">If the button doesn't work, copy this link into your browser:</p>
<p style="margin:0 0 4px;font:12px/1.6 ${FONT};word-break:break-all"><a href="${link}" style="color:${C.muted};text-decoration:underline">${link}</a></p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}">
<tr><td align="center" style="padding:40px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
<tr><td style="padding:0 4px 20px"><img src="${LOGO}" width="88" height="39" alt="TOSS" style="display:block;border:0;width:88px;height:auto"></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.line};border-radius:16px;padding:36px 36px 28px">
<h1 style="margin:0 0 18px;font:700 22px/1.25 ${FONT};letter-spacing:-0.02em;color:${C.ink}">${heading}</h1>
${body.map((t) => p(t)).join("\n")}
${btn}${codeBox}
${after.map((t) => p(t, `font-size:13px;color:${C.muted}`)).join("\n")}
${fallback}
</td></tr>
<tr><td style="padding:22px 4px 0;font:12px/1.6 ${FONT};color:${C.muted}">
TOSS · Trucking One Stop Shop<br>
TOSS Cloud · TOSS Lead Hunter · <a href="${SITE}" style="color:${C.muted};text-decoration:underline">tosscloud.tech</a><br>
You got this email because of your TOSS team account. If you weren't expecting it, you can ignore it.
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

/** Supabase template name → subject + content. */
const EMAILS = {
  invite: {
    subject: "You're invited to TOSS",
    html: layout({
      preheader: "Set your password to get started with TOSS.",
      heading: "You're invited to TOSS",
      body: [
        hi,
        `You've been added to the TOSS team{{ if .Data.position }} as <b style="color:${C.ink}">{{ .Data.position }}</b>{{ end }}. One account opens both TOSS Cloud (dispatch) and TOSS Lead Hunter (leads), depending on the access you were given.`,
        "Accept the invite to set your password.",
      ],
      button: "Accept invite",
      link: confirmLink("invite", "/set-password"),
      after: ["The link works once and expires in 24 hours. If it expires, ask your TOSS admin to send a new one."],
    }),
  },
  recovery: {
    subject: "Reset your TOSS password",
    html: layout({
      preheader: "Choose a new password for your TOSS account.",
      heading: "Reset your password",
      body: [hi, "We got a request to reset the password for your TOSS account ({{ .Email }}). The new password works for both TOSS Cloud and TOSS Lead Hunter."],
      button: "Choose a new password",
      link: confirmLink("recovery", "/set-password"),
      after: ["The link works once and expires in 1 hour. If you didn't ask for this, ignore this email: your password stays the same."],
    }),
  },
  magic_link: {
    subject: "Your TOSS sign-in link",
    html: layout({
      preheader: "Sign in to TOSS with one click.",
      heading: "Sign in to TOSS",
      body: [hi, "Use the button below to sign in to your TOSS account ({{ .Email }})."],
      button: "Sign in",
      link: confirmLink("magiclink", "/"),
      after: ["The link works once and expires in 1 hour. If you didn't ask for it, ignore this email."],
    }),
  },
  email_change: {
    subject: "Confirm your new TOSS email",
    html: layout({
      preheader: "Confirm the new email address for your TOSS account.",
      heading: "Confirm your new email",
      body: [hi, "Confirm that <b style=\"color:" + C.ink + "\">{{ .NewEmail }}</b> should be the new email for your TOSS account (now {{ .Email }})."],
      button: "Confirm new email",
      // Supabase sends this to both the old and the new address, each with its own code;
      // its own link picks the right one.
      link: "{{ .ConfirmationURL }}",
      after: ["If you didn't ask for this change, ignore this email and tell your TOSS admin."],
    }),
  },
  confirmation: {
    subject: "Confirm your TOSS email",
    html: layout({
      preheader: "Confirm your email to finish setting up TOSS.",
      heading: "Confirm your email",
      body: [hi, "Confirm {{ .Email }} to finish setting up your TOSS account."],
      button: "Confirm email",
      link: confirmLink("signup", "/"),
      after: ["If you didn't create a TOSS account, ignore this email."],
    }),
  },
  reauthentication: {
    subject: "Your TOSS verification code",
    html: layout({
      preheader: "Your TOSS verification code.",
      heading: "Your verification code",
      body: [hi, "Enter this code in TOSS to confirm it's you:"],
      code: true,
      after: ["The code expires soon. If you didn't ask for it, ignore this email and change your password."],
    }),
  },
};

// Sample data for the local previews (Go template tags resolved by hand).
function preview(html) {
  return html
    .replace(/\{\{ if \.Data\.full_name \}\}Hi \{\{ \.Data\.full_name \}\},\{\{ else \}\}Hi,\{\{ end \}\}/g, "Hi Maria Lopez,")
    .replace(/\{\{ if \.Data\.position \}\}(.*?)\{\{ end \}\}/g, "$1")
    .replaceAll("{{ .Data.position }}", "Dispatcher")
    .replaceAll("{{ .ConfirmationURL }}", "https://grvuqxxjjiebnxnwcmxu.supabase.co/auth/v1/verify?token=preview&type=email_change")
    .replaceAll("{{ .SiteURL }}", "https://www.tosscloud.tech")
    .replaceAll("{{ .TokenHash }}", "pkce_preview0123456789abcdef")
    .replaceAll("{{ .Email }}", "maria@truckingonestopshop.net")
    .replaceAll("{{ .NewEmail }}", "maria.lopez@truckingonestopshop.net")
    .replaceAll("{{ .Token }}", "482915")
    .replaceAll(LOGO, "../../../public/brand/email-logo.png");
}

fs.mkdirSync(path.join(here, "preview"), { recursive: true });
const subjects = [];
for (const [name, { subject, html }] of Object.entries(EMAILS)) {
  fs.writeFileSync(path.join(here, `${name}.html`), html);
  fs.writeFileSync(path.join(here, "preview", `${name}.html`), preview(html));
  subjects.push(`| ${name} | ${subject} |`);
}
fs.writeFileSync(
  path.join(here, "SUBJECTS.md"),
  `# Supabase email templates (TOSS)\n\nBuilt by \`node supabase/templates/build.mjs\`. In Supabase → Authentication → Emails → Templates, paste each subject and the matching \`.html\` file.\n\n| Template file | Subject |\n|---|---|\n${subjects.join("\n")}\n\nTemplate names: invite = "Invite user", recovery = "Reset password", magic_link = "Magic link", email_change = "Change email address", confirmation = "Confirm signup", reauthentication = "Reauthentication".\n`,
);

// Logo: the original SVG (dark letters, orange bars) at 3x for sharp screens.
await sharp(path.join(root, "public/brand/toss-logo.svg"), { density: 288 })
  .resize({ width: 264 })
  .png({ compressionLevel: 9 })
  .toFile(path.join(root, "public/brand/email-logo.png"));
console.log("built", Object.keys(EMAILS).join(", "));
