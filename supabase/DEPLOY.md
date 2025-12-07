# Guide de déploiement de l'Edge Function staff-admin

## Étapes de déploiement

### 1. Se connecter au CLI Supabase

```powershell
npx supabase@latest login
```

### 2. Lier ton projet

```powershell
npx supabase@latest link --project-ref jhiroxwatppflcintsvw
```

(Remplace `jhiroxwatppflcintsvw` par ton project ref si différent)

### 3. Déployer la fonction

```powershell
npx supabase@latest functions deploy staff-admin
```

C'est tout ! 🎉

## Notes importantes

- ⚠️ **Les variables `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont automatiquement disponibles** dans les Edge Functions Supabase. Tu n'as **PAS besoin** de les définir manuellement avec `secrets set`.

- La fonction utilisera automatiquement les credentials de ton projet Supabase.

- Si tu as besoin de définir d'autres secrets (qui ne commencent pas par `SUPABASE_`), tu peux utiliser:
  ```powershell
  npx supabase@latest secrets set MA_CLE_SECRETE="ma_valeur"
  ```

## Vérifier le déploiement

Après le déploiement, tu peux vérifier que la fonction est bien déployée dans:
- Dashboard Supabase → Edge Functions → `staff-admin`

## Tester la fonction

Une fois déployée, l'app mobile pourra appeler la fonction via:
```typescript
await supabase.functions.invoke('staff-admin', {
  body: { action: 'add_staff', ... }
})
```

