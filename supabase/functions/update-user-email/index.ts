import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify the caller is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Sem autorização");

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !caller) throw new Error("Token inválido");

    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    const isAdmin = callerRoles?.some((r: any) => r.role === "admin");
    if (!isAdmin) throw new Error("Apenas administradores podem alterar emails");

    const { userId, newEmail } = await req.json();
    if (!userId || !newEmail) throw new Error("userId e newEmail são obrigatórios");

    // Update auth email
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      email: newEmail,
    });
    if (updateError) throw updateError;

    // Update profiles table
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ email: newEmail })
      .eq("id", userId);
    if (profileError) throw profileError;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
