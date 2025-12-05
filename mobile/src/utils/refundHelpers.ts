import Constants from 'expo-constants';

type ExtraConfig = {
  apiUrl?: string;
};

type RefundResponse = {
  success: boolean;
  action?: 'refunded' | 'already_refunded';
  refundId?: string;
  status?: string;
  amount?: number;
  error?: string;
  details?: string;
};

/**
 * Fonction utilitaire pour rembourser un paiement Stripe lors de l'annulation d'une commande
 * 
 * Cette fonction appelle l'API Next.js qui gère le remboursement Stripe automatiquement.
 * L'API vérifie si le remboursement a déjà été effectué et retourne accordingly.
 * 
 * @param orderId - L'ID de la commande (UUID)
 * @param apiBaseUrl - L'URL de base de l'API (ex: https://votre-domaine.com ou http://localhost:3000)
 * @returns Promise<RefundResponse | null> - Retourne la réponse de l'API ou null en cas d'erreur
 */
export async function processRefund(orderId: string, apiBaseUrl?: string): Promise<RefundResponse | null> {
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
      console.warn('⚠️ [REFUND] Localhost détecté, remboursement ignoré (développement)');
      return null;
    }

    const url = `${baseUrl}/api/stripe/cancel-payment`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        orderId,
      }),
    });

    const result = await response.json();

    if (response.ok && result.success) {
      console.log('✅ [REFUND] Remboursement traité avec succès:', {
        action: result.action,
        refundId: result.refundId,
        amount: result.amount,
      });
      return result as RefundResponse;
    } else {
      // Ne pas bloquer le processus si le remboursement échoue
      console.warn('⚠️ [REFUND] Remboursement non effectué', {
        status: response.status,
        error: result.error || result.message || 'Erreur inconnue',
        details: result.details,
      });
      return result as RefundResponse;
    }
  } catch (error: any) {
    // Gérer l'erreur mais ne pas bloquer la mise à jour du statut
    const errorMessage = error?.message || String(error);
    
    // Si c'est une erreur réseau, on log un avertissement (pas une erreur critique)
    // car le remboursement est secondaire par rapport à la mise à jour du statut
    console.warn('⚠️ [REFUND] Impossible de traiter le remboursement', {
      error: errorMessage,
      orderId,
    });
    // Le statut a quand même été mis à jour, donc on continue
    return null;
  }
}

