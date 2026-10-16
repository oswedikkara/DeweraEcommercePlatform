/**
 * Dewera Enterprise Gemstone Marketplace
 * ConfigService - Centralized Platform Settings & Marketplace Master Toggle
 * Zero emoji constraint strictly adhered to.
 */

const { getDb } = require('../database/db');

class ConfigService {
  static getSetting(key, defaultValue = null) {
    const db = getDb();
    const row = db.prepare('SELECT value_json FROM platform_settings WHERE key = ?').get(key);
    if (!row) return defaultValue;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return row.value_json;
    }
  }

  static getAllSettings() {
    const db = getDb();
    const rows = db.prepare('SELECT key, value_json FROM platform_settings').all();
    const settings={marketplaceEnabled:false,maintenanceMode:false,sellerRegistrationEnabled:false,deweraEmail:'deweragems@gmail.com',deweraWhatsApp:'+94771210101'};
    for (const r of rows) {
      try {
        settings[r.key] = JSON.parse(r.value_json);
      } catch {
        settings[r.key] = r.value_json;
      }
    }
    settings.marketplaceEnabled = false;
    settings.sellerRegistrationEnabled = false;
    return settings;
  }

  static updateSetting(key, value, updatedBy = 'system') {
    const db = getDb();
    const valueJson = JSON.stringify(value);
    db.prepare(`
      INSERT INTO platform_settings (key, value_json, updated_by, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, valueJson, updatedBy);

    // Sync to data/settings.json
    const { syncToJson } = require('../database/db');
    syncToJson();
    return true;
  }

  static updateMultipleSettings(settingsObj, updatedBy = 'system') {
    for (const [key, value] of Object.entries(settingsObj)) {
      this.updateSetting(key, value, updatedBy);
    }
    return this.getAllSettings();
  }

  static isMarketplaceEnabled() {
    return false; // Dewera operates as a direct store, never a seller marketplace.
  }

  static isMaintenanceModeEnabled() {
    return Boolean(this.getSetting('maintenanceMode', false));
  }

  static getSellerMonthlyFee() {
    return Number(this.getSetting('sellerMonthlyFeeUsd', 40));
  }
}

module.exports = ConfigService;
