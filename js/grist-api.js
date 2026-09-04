/**
 * Grist API Wrapper
 * Gère la communication avec l'API Grist et la détection du contexte
 */

class GristAPI {
  static instance = null;
  static currentTable = null;
  static currentRecord = null;
  static currentTableId = null;
  static recordChangeCallback = null;
  static pollingIntervalId = null;
  static lastKnownRecordId = null;

  /**
   * Initialise l'API Grist et détecte le contexte (table et ligne)
   */
  static async init() {
    console.log('[main] GristAPI.init() appelé');
    
    return new Promise((resolve) => {
      // Attendre que grist soit disponible
      if (typeof grist === 'undefined') {
        console.error('[main] grist non défini');
        resolve(false);
        return;
      }

      // Signaler à Grist que le widget est prêt
      grist.ready({ requiredAccess: 'read table' });

      // Récupérer la table courante si disponible via le contexte
      grist.getTable().then(table => {
        console.log('[main] grist.getTable() retourné:', table);
        if (table && table.tableId) {
          GristAPI.currentTableId = table.tableId;
          GristAPI.currentTable = table;
          console.log('[main] Table détectée au init:', GristAPI.currentTableId);
        }
      }).catch(err => {
        console.log('[main] grist.getTable() erreur (normal sans SELECT BY):', err?.message);
      });

      // S'abonner aux changements de ligne via onRecord (mode SELECT BY)
      grist.onRecord((record) => {
        if (record) {
          console.log('[GristAPI] onRecord reçu, id:', record.id, 'heure:', new Date().toLocaleTimeString());
          GristAPI.currentRecord = record;
          if (GristAPI.recordChangeCallback) {
            GristAPI.recordChangeCallback(record);
          }
        }
      });

      // Démarrer le polling autonome pour détecter les changements sans SELECT BY
      GristAPI.startPolling();

      resolve(true);
    });
  }

  /**
   * Démarre un polling régulier pour détecter les changements de sélection sans SELECT BY
   */
  static startPolling() {
    if (GristAPI.pollingIntervalId !== null) {
      console.log('[GristAPI] Polling déjà actif, arrêt de l\'ancien');
      clearInterval(GristAPI.pollingIntervalId);
    }

    GristAPI.pollingIntervalId = setInterval(async () => {
      try {
        // Récupérer la ligne actuellement sélectionnée dans la table
        const selectedRecord = await grist.fetchSelectedRecord();
        
        if (selectedRecord && selectedRecord.id !== undefined) {
          // Déterminer la table depuis le contexte s'il n'est pas encore connu
          if (!GristAPI.currentTableId) {
            const tableContext = await grist.getTable().catch(() => null);
            if (tableContext && tableContext.tableId) {
              GristAPI.currentTableId = tableContext.tableId;
            }
          }

          // Vérifier si c'est un changement de ligne
          if (selectedRecord.id !== GristAPI.lastKnownRecordId) {
            console.log('[GristAPI] Changement de ligne détecté: ancien id=', GristAPI.lastKnownRecordId, ', nouveau id=', selectedRecord.id, 'heure:', new Date().toLocaleTimeString());
            GristAPI.lastKnownRecordId = selectedRecord.id;
            GristAPI.currentRecord = selectedRecord;
            
            // Notifier les abonnés du changement
            if (GristAPI.recordChangeCallback) {
              GristAPI.recordChangeCallback(selectedRecord);
            }
          }
        }
      } catch (err) {
        // Silencieusement ignorer les erreurs de polling (pas de SELECT BY configuré, c'est normal)
        // Ne pas logger en boucle pour ne pas polluer la console
      }
    }, 500); // Polling toutes les 500ms
  }

  /**
   * Arrête le polling autonome
   */
  static stopPolling() {
    if (GristAPI.pollingIntervalId !== null) {
      clearInterval(GristAPI.pollingIntervalId);
      GristAPI.pollingIntervalId = null;
    }
  }

  /**
   * Enregistre une fonction de callback appelée quand la ligne change
   * @param {Function} callback Fonction appelée avec le nouveau record
   */
  static onRecordChange(callback) {
    GristAPI.recordChangeCallback = callback;
  }

  /**
   * Récupère la table courante
   */
  static getCurrentTable() {
    return GristAPI.currentTable;
  }

  /**
   * Récupère le record courant
   */
  static getCurrentRecord() {
    return GristAPI.currentRecord;
  }

  /**
   * Récupère l'id de la table courante
   */
  static getCurrentTableId() {
    return GristAPI.currentTableId;
  }
}
