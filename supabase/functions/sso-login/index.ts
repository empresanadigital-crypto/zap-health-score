import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return new Response(JSON.stringify({ error: "Token required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const validateRes = await fetch(
      "https://pyveshoijpwasqbwubgi.supabase.co/functions/v1/sso-validate",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }
    );

    const validateData = await validateRes.json();

    if (!validateData.valid || !validateData.email) {
      return new Response(JSON.stringify({ error: "Invalid or expired SSO token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, full_name, whatsapp_phone } = validateData;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    if (!existingProfile) {
      const tempPassword = crypto.randomUUID().slice(0, 12) + "A1!";
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: full_name || email.split("@")[0] },
      });

      if (createError || !newUser?.user) {
        console.error("[sso-login] Failed to create user:", createError?.message);
        return new Response(JSON.stringify({ error: "Failed to create account" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await new Promise(r => setTimeout(r, 1000));
      console.log("[sso-login] Conta criada via SSO:", email);
    } else {
      console.log("[sso-login] Usuário existente:", email);
    }

    const { data: magicLink, error: magicError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (magicError || !magicLink?.properties?.hashed_token) {
      console.error("[sso-login] Magic link error:", magicError?.message);
      return new Response(JSON.stringify({ error: "Failed to generate login" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const verifyUrl = `${SUPABASE_URL}/auth/v1/verify?token=${magicLink.properties.hashed_token}&type=magiclink&redirect_to=${encodeURIComponent("https://checkzap.readyzap.com.br/dashboard")}`;

    console.log("[sso-login] Login gerado para:", email);

    return new Response(JSON.stringify({
      success: true,
      loginUrl: verifyUrl,
      email,
      isNewUser: !existingProfile,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (e) {
    console.error("[sso-login] Error:", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
