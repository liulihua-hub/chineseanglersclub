# Prevent automated registrations

The registration form uses Cloudflare Turnstile with Supabase Auth's CAPTCHA verification. The browser-side widget alone is not a security boundary: Supabase must also verify each token using the Turnstile secret.

## Setup

1. Create a Turnstile widget in the Cloudflare dashboard for the site's domain and copy its **site key**.
2. In `index.html`, replace `YOUR_CLOUDFLARE_TURNSTILE_SITE_KEY` with that site key. This public key is expected to be visible in the page.
3. In the Supabase dashboard, open **Authentication > Bot and Abuse Protection** (the menu label may vary) and enable CAPTCHA using **Turnstile**.
4. Enter the widget's **secret key** in Supabase's CAPTCHA settings. Never put the secret key in `index.html` or any public file.
5. Test a real signup on the deployed site. It should require a successful challenge, and Supabase should reject missing or invalid CAPTCHA tokens.

Registration intentionally remains disabled until a site key is configured. Keep email confirmation enabled in Supabase and configure Auth rate limits as additional safeguards. CAPTCHA raises the cost of automated signups but cannot guarantee that all bots will be stopped.
