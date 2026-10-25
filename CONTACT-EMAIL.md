# Contact form email delivery

The contact form sends email directly through a Supabase Edge Function and Resend. Visitors do not need an email app. The recipient and provider credentials are kept in Supabase Edge Function secrets, not in the public website. No database migration is needed.

## Prerequisites

- A Resend account with a verified sending domain.
- A Resend API key with sending access.
- The Cloudflare Turnstile secret that matches the site key in `index.html`.
- Supabase CLI installed and access to the `jebpxetlkgragnelqimb` project.

## Configure function secrets

In Supabase Dashboard, open **Edge Functions > Secrets** and add:

| Name | Value |
| --- | --- |
| `RESEND_API_KEY` | Your Resend API key. This is separate from putting SMTP credentials in Supabase Auth settings; add it here for this function. |
| `CONTACT_FROM_EMAIL` | A sender address on the domain verified with Resend, such as `Chinese Anglers Club <contact@your-verified-domain.ca>`. |
| `CONTACT_TO_EMAIL` | The private inbox where contact messages should be delivered. |
| `TURNSTILE_SECRET_KEY` | The Turnstile secret matching the site's public site key. |
| `SITE_ORIGIN` | `https://chineseanglersclub.ca` |

Never put the Resend API key or Turnstile secret in `index.html` or commit them to the repository. Add `chineseanglersclub.ca` to the Turnstile widget's allowed hostnames.

## Deploy the function

From the repository root, authenticate, link the project, and deploy:

```powershell
supabase login
supabase link --project-ref jebpxetlkgragnelqimb
supabase functions deploy contact-email
```

The function has JWT verification disabled so the public website can call it. It checks the exact website origin, validates and bounds submitted fields, verifies Turnstile server-side, then sends a plain-text email through Resend with the visitor's email set as Reply-To.

After deploying, publish the updated `index.html` and test the form from `https://chineseanglersclub.ca`. Check the `contact-email` function logs in Supabase and the Resend email logs if delivery fails.
