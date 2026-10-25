const jsonHeaders = { "Content-Type": "application/json" };

const jsonResponse = (request: Request, status: number, body: Record<string, unknown>, allowedOrigin: string | null) => {
  const headers = new Headers(jsonHeaders);
  if (allowedOrigin && request.headers.get("origin") === allowedOrigin) {
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
    headers.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    headers.set("Vary", "Origin");
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
};

Deno.serve(async (request: Request) => {
  let allowedOrigin: string;
  try {
    const siteOrigin = Deno.env.get("SITE_ORIGIN");
    if (!siteOrigin) throw new Error("SITE_ORIGIN is missing.");
    const parsedOrigin = new URL(siteOrigin);
    if (parsedOrigin.protocol !== "https:" || parsedOrigin.origin !== siteOrigin.replace(/\/$/, "")) {
      throw new Error("SITE_ORIGIN must be an HTTPS origin.");
    }
    allowedOrigin = parsedOrigin.origin;
  } catch (error) {
    console.error("Contact function requires a valid SITE_ORIGIN secret:", error);
    return jsonResponse(request, 500, { error: "Contact service is not configured." }, null);
  }

  if (request.headers.get("origin") !== allowedOrigin) {
    return jsonResponse(request, 403, { error: "Origin is not allowed." }, allowedOrigin);
  }
  if (request.method === "OPTIONS") {
    return jsonResponse(request, 204, {}, allowedOrigin);
  }
  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed." }, allowedOrigin);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return jsonResponse(request, 415, { error: "Expected a JSON request." }, allowedOrigin);
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 10000) {
    return jsonResponse(request, 413, { error: "Request is too large." }, allowedOrigin);
  }

  let payload: unknown;
  try {
    const body = await request.text();
    if (body.length > 10000) {
      return jsonResponse(request, 413, { error: "Request is too large." }, allowedOrigin);
    }
    payload = JSON.parse(body);
  } catch {
    return jsonResponse(request, 400, { error: "Invalid JSON request." }, allowedOrigin);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonResponse(request, 400, { error: "Please check the contact form fields." }, allowedOrigin);
  }

  const input = payload as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim() : "";
  const subject = typeof input.subject === "string" ? input.subject.trim() : "";
  const message = typeof input.message === "string" ? input.message.trim() : "";
  const captchaToken = typeof input.captchaToken === "string" ? input.captchaToken.trim() : "";

  if (
    name.length < 1 || name.length > 100 || /[\r\n]/.test(name) ||
    email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email) ||
    subject.length < 1 || subject.length > 150 || /[\r\n]/.test(subject) ||
    message.length < 1 || message.length > 5000 ||
    captchaToken.length < 1 || captchaToken.length > 2048
  ) {
    return jsonResponse(request, 400, { error: "Please check the contact form fields." }, allowedOrigin);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("CONTACT_FROM_EMAIL");
  const toEmail = Deno.env.get("CONTACT_TO_EMAIL");
  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!resendApiKey || !fromEmail || !toEmail || !turnstileSecret) {
    console.error("Contact function is missing one or more delivery or CAPTCHA secrets.");
    return jsonResponse(request, 500, { error: "Contact service is not configured." }, allowedOrigin);
  }

  let captchaResult: { success?: boolean; hostname?: string; action?: string };
  try {
    const captchaResponse = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: turnstileSecret, response: captchaToken })
    });
    if (!captchaResponse.ok) {
      console.error("Turnstile verification service returned an unsuccessful response.");
      return jsonResponse(request, 502, { error: "Could not verify the security check." }, allowedOrigin);
    }
    captchaResult = await captchaResponse.json();
  } catch (error) {
    console.error("Turnstile verification request failed:", error);
    return jsonResponse(request, 502, { error: "Could not verify the security check." }, allowedOrigin);
  }

  if (
    !captchaResult.success ||
    captchaResult.hostname !== new URL(allowedOrigin).hostname ||
    captchaResult.action !== "contact"
  ) {
    return jsonResponse(request, 400, { error: "The security check failed. Please try again." }, allowedOrigin);
  }

  try {
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: email,
        subject,
        text: `Name: ${name}\nEmail: ${email}\n\n${message}`
      })
    });
    if (!emailResponse.ok) {
      console.error(`Resend rejected a contact message with status ${emailResponse.status}.`);
      return jsonResponse(request, 502, { error: "Could not send your message." }, allowedOrigin);
    }
  } catch (error) {
    console.error("Resend delivery request failed:", error);
    return jsonResponse(request, 502, { error: "Could not send your message." }, allowedOrigin);
  }

  return jsonResponse(request, 200, { sent: true }, allowedOrigin);
});
