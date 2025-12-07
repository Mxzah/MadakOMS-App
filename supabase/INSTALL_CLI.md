# Installation du CLI Supabase sur Windows

## Option 1: Scoop (Recommandé)

1. **Installer Scoop** (si pas déjà installé):
   ```powershell
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   Invoke-RestMethod -Uri https://get.scoop.sh | Invoke-Expression
   ```

2. **Installer Supabase CLI**:
   ```powershell
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

3. **Vérifier l'installation**:
   ```powershell
   supabase --version
   ```

## Option 2: Chocolatey

1. **Installer Chocolatey** (si pas déjà installé):
   - Ouvrir PowerShell en tant qu'administrateur
   - Exécuter:
   ```powershell
   Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
   ```

2. **Installer Supabase CLI**:
   ```powershell
   choco install supabase
   ```

## Option 3: Téléchargement direct (Manuel)

1. Aller sur: https://github.com/supabase/cli/releases
2. Télécharger `supabase_windows_amd64.zip` (ou la version appropriée)
3. Extraire le fichier `supabase.exe`
4. Ajouter le dossier au PATH Windows, ou placer `supabase.exe` dans un dossier déjà dans le PATH

## Option 4: Utiliser npx (sans installation globale)

Tu peux utiliser le CLI via `npx` sans l'installer:

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest functions deploy staff-admin
```

## Après l'installation

Une fois le CLI installé, tu peux continuer avec:

```powershell
cd C:\Users\godsn\Desktop\All\Coding\MadakOMS-App\supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="ta_service_role_key"
supabase functions deploy staff-admin
```

