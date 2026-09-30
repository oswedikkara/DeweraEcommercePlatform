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
    const settings = {
      marketplaceEnabled: true,
      maintenanceMode: false,
      sellerRegistrationEnabled: true,
      sellerMonthlyFeeUsd: 40,
      deweraEmail: 'concierge@dewera.com',
      deweraWhatsApp: '+94771234567',
      deweraPhone: '+94112345678',
      safeWallets: {
        usdtTrc20: 'TYDzsxd54kE31x845c0882nLK98F4V11eX',
        usdtErc20: '0x71C8363837937A71bF85786A7283B4652F942460',
        usdcErc20: '0x71C8363837937A71bF85786A7283B4652F942460',
        btc: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
      },
      bankAccount: {
        bankName: 'Commercial Bank of Ceylon',
        accountName: 'House of Dewera (Pvt) Ltd',
        accountNumber: '100029384756',
        branch: 'Colombo Elite / Ratnapura Branch',
        swiftCode: 'COMBCEKL',
        currency: 'USD / LKR',
        instructions: 'Include your Atelier ID or Gemstone Reference in the wire transfer memo.'
      }
    };
    for (const r of rows) {
      try {
        settings[r.key] = JSON.parse(r.value_json);
      } catch {
        settings[r.key] = r.value_json;
      }
    }
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
    return Boolean(this.getSetting('marketplaceEnabled', true));
  }

  static isMaintenanceModeEnabled() {
    return Boolean(this.getSetting('maintenanceMode', false));
  }

  static getSellerMonthlyFee() {
    return Number(this.getSetting('sellerMonthlyFeeUsd', 40));
  }
}

module.exports = ConfigService;
