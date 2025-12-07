# Supabase Edge Functions

Ce dossier contient les Edge Functions Supabase pour l'application MadakOMS.

## Structure

```
supabase/
  functions/
    staff-admin/
      index.ts    # Edge Function pour gérer les employés (ajout, reset password, activer/désactiver)
```

## Installation

1. **Installer le CLI Supabase** (si pas déjà fait):
   ```bash
   npm install -g supabase
   ```

2. **Se connecter à ton projet Supabase**:
   ```bash
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   ```
   (Tu peux trouver ton `project-ref` dans l'URL de ton dashboard Supabase: `https://app.supabase.com/project/YOUR_PROJECT_REF`)

3. **Configurer les secrets** (variables d'environnement):
   ```bash
   supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY="ta_service_role_key"
   ```
   (Tu peux trouver ta `service_role_key` dans: Dashboard Supabase → Settings → API → `service_role` key)

## Déploiement

Pour déployer la fonction `staff-admin`:

```bash
supabase functions deploy staff-admin
```

## Test local (optionnel)

Pour tester localement avant de déployer:

```bash
supabase functions serve staff-admin
```

Puis dans un autre terminal, tester avec curl:

```bash
curl -i --location --request POST 'http://localhost:54321/functions/v1/staff-admin' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{
    "action": "add_staff",
    "restaurantId": "uuid-here",
    "username": "test-user",
    "role": "cook"
  }'
```

## Actions supportées

### 1. `add_staff`
Crée un nouvel employé avec un compte Supabase Auth.

**Payload:**
```json
{
  "action": "add_staff",
  "restaurantId": "uuid",
  "username": "chef-cuisine",
  "role": "cook" | "delivery" | "manager"
}
```

**Réponse:**
```json
{
  "tempPassword": "Madakxxxxxx!",
  "username": "chef-cuisine"
}
```

### 2. `reset_password`
Réinitialise le mot de passe d'un employé.

**Payload:**
```json
{
  "action": "reset_password",
  "authUserId": "uuid",
  "staffId": "uuid",
  "username": "chef-cuisine"
}
```

**Réponse:**
```json
{
  "tempPassword": "Madakxxxxxx!"
}
```

### 3. `toggle_active`
Active ou désactive un compte employé.

**Payload:**
```json
{
  "action": "toggle_active",
  "staffId": "uuid",
  "isActive": true | false
}
```

**Réponse:**
```json
{
  "ok": true
}
```

## Notes importantes

- ⚠️ **Ne jamais commit la `service_role_key` dans Git!**
- Les secrets sont stockés de manière sécurisée dans Supabase via `supabase secrets set`
- Cette fonction utilise la `service_role_key` pour avoir les permissions admin nécessaires

