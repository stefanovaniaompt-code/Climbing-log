import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://stefanovaniaompt-code.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const appUrl = "https://stefanovaniaompt-code.github.io/Climbing-log/";

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function envKey(jsonName: string, legacyName: string) {
  const named = Deno.env.get(jsonName);
  if (named) {
    const keys = JSON.parse(named) as Record<string, string>;
    if (keys.default) return keys.default;
  }
  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Metodo non consentito." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publishableKey = envKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
    const secretKey = envKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token || !supabaseUrl || !publishableKey || !secretKey) return json({ error: "Accesso non valido." }, 401);

    const authClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Sessione non valida." }, 401);

    const { data: profile, error: profileError } = await admin.from("profiles").select("role").eq("id", userData.user.id).single();
    if (profileError || profile?.role !== "coach") return json({ error: "Solo la coach può invitare un atleta." }, 403);

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) return json({ error: "Indirizzo email non valido." }, 400);
    if (email === String(userData.user.email ?? "").toLowerCase()) return json({ error: "Non puoi invitare il tuo stesso account." }, 400);

    const { data: invitation, error: invitationError } = await admin.from("athlete_invitations").upsert({
      coach_id: userData.user.id,
      email,
      athlete_id: null,
      status: "pending",
      invited_at: new Date().toISOString(),
      accepted_at: null,
    }, { onConflict: "coach_id,email_normalized" }).select("id,email,status").single();
    if (invitationError) throw invitationError;

    const mailClient = createClient(supabaseUrl, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: mailError } = await mailClient.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: appUrl },
    });
    if (mailError) return json({ error: `Invito salvato, ma l'email non è partita: ${mailError.message}`, invitation }, 502);

    return json({ ok: true, invitation });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Invito non riuscito." }, 500);
  }
});
