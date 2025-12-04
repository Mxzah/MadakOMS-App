import Constants from 'expo-constants';

type ExtraConfig = {
  apiUrl?: string;
};

/**
 * Fonction utilitaire pour envoyer un SMS au client lors d'un changement de statut de commande
 * 
 * Cette fonction appelle l'API Next.js qui envoie automatiquement le SMS approprié
 * selon le nouveau statut de la commande.
 * 
 * @param orderId - L'ID de la commande (UUID)
 * @param apiBaseUrl - L'URL de base de l'API (ex: https://votre-domaine.com ou http://localhost:3000)
 * @returns Promise<void> - Ne retourne rien, les erreurs sont loggées mais ne bloquent pas
 */
export async function sendStatusSMS(orderId: string, apiBaseUrl?: string): Promise<void> {
  try {
    // URL par défaut pour le développement local
    // En production, cette URL devrait être configurée via app.json -> extra.apiUrl
    const extra = (Constants.expoConfig?.extra ?? {}) as ExtraConfig;
    const baseUrl = apiBaseUrl || extra.apiUrl || 'http://localhost:3000';
    
    // Vérifier si l'URL est localhost - sur un appareil mobile, localhost ne fonctionnera pas
    const isLocalhost = baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1');
    
    // Sur un appareil mobile, si l'URL est localhost, on ne peut pas y accéder
    // On ignore silencieusement car c'est attendu en développement
    if (isLocalhost) {
      return;
    }

    const url = `${baseUrl}/api/orders/${orderId}/send-status-sms`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      const result = await response.json();
      console.log('SMS envoyé avec succès:', result.sid || result.message);
    } else {
      // Ne pas bloquer le processus si l'envoi SMS échoue
      const error = await response.json().catch(() => ({}));
      console.warn('Avertissement: SMS non envoyé', {
        status: response.status,
        error: error.error || error.message || 'Erreur inconnue',
      });
    }
  } catch (error: any) {
    // Gérer l'erreur mais ne pas bloquer la mise à jour du statut
    const errorMessage = error?.message || String(error);
    
    // Si c'est une erreur réseau, on log un avertissement (pas une erreur critique)
    // car l'envoi SMS est secondaire par rapport à la mise à jour du statut
    console.warn('Avertissement: Impossible d\'envoyer le SMS', {
      error: errorMessage,
      orderId,
    });
    // Le statut a quand même été mis à jour, donc on continue
  }
}

