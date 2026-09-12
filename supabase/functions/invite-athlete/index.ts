import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const corsHeaders = {
  "Access-Control-Allow-Origin":
    "https://stefanovaniaompt-code.github.io",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":
    "POST, OPTIONS",
  "Content-Type":
    "application/json",
};

const appUrl =
  "https://stefanovaniaompt-code.github.io/Climbing-log/";

const callbackUrl =
  appUrl + "auth/callback";

function json(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: corsHeaders,
    },
  );
}

function envKey(
  jsonName: string,
  legacyName: string,
) {
  const named = Deno.env.get(jsonName);

  if (named) {
    const keys =
      JSON.parse(named) as Record<string, string>;

    if (keys.default) {
      return keys.default;
    }
  }

  return Deno.env.get(legacyName) ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      { headers: corsHeaders },
    );
  }

  if (req.method !== "POST") {
    return json(
      { error: "Metodo non consentito." },
      405,
    );
  }

  try {
    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") ?? "";

    const publishableKey = envKey(
      "SUPABASE_PUBLISHABLE_KEYS",
      "SUPABASE_ANON_KEY",
    );

    const secretKey = envKey(
      "SUPABASE_SECRET_KEYS",
      "SUPABASE_SERVICE_ROLE_KEY",
    );

    const token =
      (
        req.headers.get("Authorization") ?? ""
      ).replace(/^Bearer\s+/i, "");

    if (
      !token ||
      !supabaseUrl ||
      !publishableKey ||
      !secretKey
    ) {
      return json(
        { error: "Accesso non valido." },
        401,
      );
    }

    const authClient = createClient(
      supabaseUrl,
      publishableKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const admin = createClient(
      supabaseUrl,
      secretKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const {
      data: userData,
      error: userError,
    } = await authClient.auth.getUser(token);

    if (
      userError ||
      !userData.user
    ) {
      return json(
        { error: "Sessione non valida." },
        401,
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await admin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single();

    if (
      profileError ||
      profile?.role !== "coach"
    ) {
      return json(
        {
          error:
            "Solo il coach puo invitare un atleta.",
        },
        403,
      );
    }

    const body =
      await req.json().catch(() => ({}));

    const athleteId =
      String(body?.athleteId ?? "").trim();

    const email =
      String(body?.email ?? "")
        .trim()
        .toLowerCase();

    if (
      !athleteId ||
      athleteId.length > 80
    ) {
      return json(
        { error: "Atleta non valido." },
        400,
      );
    }

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 320
    ) {
      return json(
        {
          error:
            "Indirizzo email non valido.",
        },
        400,
      );
    }

    if (
      email ===
      String(
        userData.user.email ?? "",
      ).toLowerCase()
    ) {
      return json(
        {
          error:
            "Non puoi invitare il tuo stesso account.",
        },
        400,
      );
    }

    const {
      data: relationship,
      error: relationshipError,
    } = await admin
      .from("coach_athletes")
      .select("athlete_id,status")
      .eq(
        "coach_id",
        userData.user.id,
      )
      .eq(
        "athlete_id",
        athleteId,
      )
      .maybeSingle();

    if (relationshipError) {
      throw relationshipError;
    }

    if (!relationship) {
      return json(
        {
          error:
            "Questo atleta non appartiene al coach corrente.",
        },
        403,
      );
    }

    const {
      data: existingInvitation,
      error: existingInvitationError,
    } = await admin
      .from("athlete_invitations")
      .select("id,status,athlete_id")
      .eq(
        "coach_id",
        userData.user.id,
      )
      .eq(
        "email_normalized",
        email,
      )
      .maybeSingle();

    if (existingInvitationError) {
      throw existingInvitationError;
    }

    if (
      existingInvitation?.status ===
      "accepted"
    ) {
      const {
        data: acceptedAthlete,
        error: acceptedAthleteError,
      } = await admin
        .from("athletes")
        .select("user_id")
        .eq("id", athleteId)
        .maybeSingle();

      if (acceptedAthleteError) {
        throw acceptedAthleteError;
      }

      let onboardingCompleted = false;

      if (acceptedAthlete?.user_id) {
        const {
          data: acceptedProfile,
          error: acceptedProfileError,
        } = await admin
          .from("profiles")
          .select("onboarding_completed_at")
          .eq(
            "id",
            acceptedAthlete.user_id,
          )
          .maybeSingle();

        if (acceptedProfileError) {
          throw acceptedProfileError;
        }

        onboardingCompleted = Boolean(
          acceptedProfile?.onboarding_completed_at,
        );
      }

      if (onboardingCompleted) {
        return json(
          {
            error:
              "Questo atleta ha gia completato l invito.",
          },
          409,
        );
      }
    }

    if (
      existingInvitation?.athlete_id &&
      existingInvitation.athlete_id !== athleteId
    ) {
      return json(
        {
          error:
            "Questa email e gia associata a un altro atleta.",
        },
        409,
      );
    }

    const {
      error: athleteError,
    } = await admin
      .from("athletes")
      .update({ email })
      .eq("id", athleteId)
      .select("id")
      .single();

    if (athleteError) {
      throw athleteError;
    }

    const {
      data: invitation,
      error: invitationError,
    } = await admin
      .from("athlete_invitations")
      .upsert(
        {
          coach_id:
            userData.user.id,
          athlete_id:
            athleteId,
          email,
          status:
            "pending",
          invited_at:
            new Date().toISOString(),
          accepted_at:
            null,
        },
        {
          onConflict:
            "coach_id,email_normalized",
        },
      )
      .select("id,email,status")
      .single();

    if (invitationError) {
      throw invitationError;
    }

    let delivered = false;
    let deliveryError = "";

    const {
      error: inviteError,
    } =
      await admin.auth.admin.inviteUserByEmail(
        email,
        {
          redirectTo:
            callbackUrl,
          data: {
            athlete_id:
              athleteId,
            invited_by:
              userData.user.id,
          },
        },
      );

    if (!inviteError) {
      delivered = true;
    } else {
      const normalized =
        inviteError.message.toLowerCase();

      const existingUser =
        normalized.includes("already") ||
        normalized.includes("registered") ||
        normalized.includes("exists");

      if (existingUser) {
        const mailClient =
          createClient(
            supabaseUrl,
            publishableKey,
            {
              auth: {
                persistSession: false,
                autoRefreshToken: false,
              },
            },
          );

        const {
          error: magicError,
        } =
          await mailClient.auth.signInWithOtp(
            {
              email,
              options: {
                shouldCreateUser:
                  false,
                emailRedirectTo:
                  callbackUrl,
              },
            },
          );

        if (!magicError) {
          delivered = true;
        } else {
          deliveryError =
            magicError.message;
        }
      } else {
        deliveryError =
          inviteError.message;
      }
    }

    return json({
      ok: true,
      delivered,
      deliveryError:
        delivered
          ? undefined
          : deliveryError ||
            "Invio email non confermato.",
      invitation,
    });
  } catch (error) {
    console.error(error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Invito non riuscito.",
      },
      500,
    );
  }
});
