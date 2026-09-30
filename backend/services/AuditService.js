/**
 * Dewera Enterprise Gemstone Marketplace
 * AuditService - Administrative & Security Audit Trail
 * Zero emoji constraint strictly adhered to.
 */

const { getDb } = require('../database/db');

class AuditService {
  static log({ actorId, actorRole, eventType, entityType, entityId, oldValue = null, newValue = null, ipAddress = null }) {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO audit_logs (
          actor_id, actor_role, event_type, entity_type, entity_id,
          old_value_json, new_value_json, ip_address, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);
      stmt.run(
        actorId || 'system',
        actorRole || 'system',
        eventType,
        entityType,
        entityId || null,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
        ipAddress || '127.0.0.1'
      );
    } catch (err) {
      console.error('[AUDIT] Failed to write audit log:', err.message);
    }
  }

  static getRecentLogs(limit = 100, filterType = null) {
    const db = getDb();
    if (filterType) {
      return db.prepare('SELECT * FROM audit_logs WHERE event_type = ? ORDER BY timestamp DESC LIMIT ?').all(filterType, limit);
    }
    return db.prepare('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?').all(limit);
  }
}

module.exports = AuditService;
