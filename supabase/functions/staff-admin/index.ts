import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Ces variables sont automatiquement disponibles dans les Edge Functions Supabase
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Client admin (service role)
const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type AddStaffPayload = {
  restaurantId: string;
  username: string;
  role: "cook" | "delivery" | "manager";
  password?: string; // Optionnel: si fourni, utilise ce mot de passe, sinon génère un
};

type ResetPasswordPayload = {
  staffId: string;
  authUserId: string;
  username: string;
  password?: string; // Optionnel: si fourni, utilise ce mot de passe, sinon génère un
};

type ToggleActivePayload = {
  staffId: string;
  isActive: boolean;
};

function generateTempPassword() {
  const random = Math.random().toString(36).slice(-6);
  return `Madak${random}!`;
}

// Normalise le slug du restaurant pour l'utiliser dans l'email
function normalizeRestaurantSlug(slug: string): string {
  return slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
}

// Génère le domaine email basé sur le slug du restaurant
function getRestaurantEmailDomain(restaurantSlug: string): string {
  const normalized = normalizeRestaurantSlug(restaurantSlug);
  return `@madak-${normalized}.internal`;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { action, ...payload } = await req.json();

    if (action === "add_staff") {
      const { restaurantId, username, role, password } = payload as AddStaffPayload;

      if (!restaurantId || !username || !role) {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Récupérer le slug du restaurant
      const { data: restaurant, error: restaurantError } = await supabaseAdmin
        .from("restaurants")
        .select("slug")
        .eq("id", restaurantId)
        .single();

      if (restaurantError || !restaurant) {
        console.error("Restaurant fetch error:", restaurantError);
        return new Response(
          JSON.stringify({ error: "Restaurant not found", details: restaurantError?.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!restaurant.slug) {
        console.error("Restaurant slug is missing for restaurantId:", restaurantId);
        return new Response(
          JSON.stringify({ error: "Restaurant slug is missing" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedUsername = username.trim().toLowerCase().replace(/\s+/g, "");
      const emailDomain = getRestaurantEmailDomain(restaurant.slug);
      const pseudoEmail = `${normalizedUsername}${emailDomain}`;
      
      console.log("Creating user with email:", pseudoEmail, "for restaurant slug:", restaurant.slug);
      // Utilise le mot de passe fourni ou génère-en un
      // Vérifie explicitement si password existe et n'est pas vide
      const hasCustomPassword = password && typeof password === 'string' && password.trim().length > 0;
      const finalPassword = hasCustomPassword ? password.trim() : generateTempPassword();

      const { data: userData, error: createError } =
        await supabaseAdmin.auth.admin.createUser({
          email: pseudoEmail,
          password: finalPassword,
          email_confirm: true,
        });

      if (createError) {
        console.error("Create user error:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create auth user", details: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const authUserId = userData.user?.id;
      if (!authUserId) {
        return new Response(
          JSON.stringify({ error: "No auth user id returned" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: insertError } = await supabaseAdmin.from("staff_users").insert({
        restaurant_id: restaurantId,
        username: normalizedUsername,
        role,
        auth_user_id: authUserId,
        is_active: true,
      });

      if (insertError) {
        console.error("Insert staff_user error:", insertError);
        // Optionally try to delete the auth user if staff_user insert fails
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
        return new Response(
          JSON.stringify({ error: "Failed to insert staff_user", details: insertError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Retourne toujours le mot de passe utilisé (personnalisé ou généré)
      // pour que l'utilisateur puisse le voir et le communiquer
      return new Response(
        JSON.stringify({ 
          tempPassword: finalPassword, 
          username: normalizedUsername,
          wasGenerated: !hasCustomPassword 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "reset_password") {
      const { authUserId, password } = payload as ResetPasswordPayload;

      if (!authUserId) {
        return new Response(
          JSON.stringify({ error: "Missing authUserId" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Utilise le mot de passe fourni ou génère-en un
      // Vérifie explicitement si password existe et n'est pas vide
      const hasCustomPassword = password && typeof password === 'string' && password.trim().length > 0;
      const finalPassword = hasCustomPassword ? password.trim() : generateTempPassword();

      const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        password: finalPassword,
      });

      if (error) {
        console.error("Reset password error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to reset password", details: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          tempPassword: finalPassword,
          wasGenerated: !hasCustomPassword 
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "toggle_active") {
      const { staffId, isActive } = payload as ToggleActivePayload;

      if (!staffId || typeof isActive !== "boolean") {
        return new Response(
          JSON.stringify({ error: "Missing required fields" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error } = await supabaseAdmin
        .from("staff_users")
        .update({ is_active: isActive })
        .eq("id", staffId);

      if (error) {
        console.error("Toggle active error:", error);
        return new Response(
          JSON.stringify({ error: "Failed to update staff user", details: error.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Server error:", err);
      return new Response(
        JSON.stringify({ error: "Server error", details: err instanceof Error ? err.message : String(err) }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
  }
});

