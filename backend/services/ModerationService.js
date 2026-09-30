/**
 * Dewera Enterprise Gemstone Marketplace
 * ModerationService - Incident Reports, Evidence Dossiers & Ban Adjudication
 * Zero emoji constraint strictly adhered to.
 */

const { getDb, syncToJson } = require('../database/db');
const AuditService = require('./AuditService');

class ModerationService {
  /**
   * Moderator or Admin creates a violation incident report with evidence.
   */
  static createIncidentReport({ sellerId, violationCategory, description, evidenceProof = null, moderator }) {
    const db = getDb();
    const seller = db.prepare('SELECT id, atelier_name FROM seller_profiles WHERE id = ?').get(sellerId);
    if (!seller) {
      throw new Error('Seller profile not found.');
    }

    const reportId = `rep-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(`
      INSERT INTO moderation_reports (
        id, seller_id, reported_by, moderator_id, violation_category,
        description, evidence_proof, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_admin_review', CURRENT_TIMESTAMP)
    `).run(
      reportId,
      sellerId,
      moderator.username || moderator.name,
      moderator.staffId || moderator.id,
      violationCategory,
      description,
      evidenceProof
    );

    AuditService.log({
      actorId: moderator.staffId || moderator.id,
      actorRole: moderator.role,
      eventType: 'MODERATION_REPORT_CREATED',
      entityType: 'moderation_report',
      entityId: reportId,
      newValue: { sellerId, violationCategory }
    });

    return { reportId, status: 'pending_admin_review' };
  }

  /**
   * Moderator requests a formal seller ban/suspension.
   */
  static submitBanRequest({ sellerId, reason, evidence = null, moderator }) {
    const db = getDb();
    const seller = db.prepare('SELECT id, atelier_name FROM seller_profiles WHERE id = ?').get(sellerId);
    if (!seller) {
      throw new Error('Seller profile not found.');
    }

    const requestId = `banreq-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(`
      INSERT INTO ban_requests (
        id, seller_id, moderator_id, reason, evidence, status, created_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
    `).run(
      requestId,
      sellerId,
      moderator.staffId || moderator.id,
      reason,
      evidence
    );

    AuditService.log({
      actorId: moderator.staffId || moderator.id,
      actorRole: moderator.role,
      eventType: 'BAN_REQUEST_SUBMITTED',
      entityType: 'ban_request',
      entityId: requestId,
      newValue: { sellerId, reason }
    });

    return { requestId, status: 'pending' };
  }

  /**
   * Executive Adjudication: Exclusively executable by Head Admin (super_admin).
   */
  static adjudicateBanRequest({ requestId, decision, actor, adminNotes = '' }) {
    if (actor.role !== 'super_admin') {
      throw new Error('Access denied: Executive ban adjudication is reserved exclusively for the Head Admin.');
    }

    const db = getDb();
    const request = db.prepare('SELECT * FROM ban_requests WHERE id = ?').get(requestId);
    if (!request) {
      throw new Error('Ban request not found.');
    }

    if (request.status !== 'pending') {
      throw new Error(`This ban request has already been adjudicated (${request.status}).`);
    }

    const seller = db.prepare('SELECT * FROM seller_profiles WHERE id = ?').get(request.seller_id);
    if (!seller) {
      throw new Error('Target seller profile not found.');
    }

    if (decision === 'approve') {
      // 1. Mark request approved
      db.prepare(`
        UPDATE ban_requests SET
          status = 'approved',
          actioned_by = ?,
          actioned_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(actor.username || actor.name, requestId);

      // 2. Ban seller profile
      db.prepare(`
        UPDATE seller_profiles SET
          status = 'banned',
          sanction_status = 'banned',
          sanction_reason = ?,
          sanction_evidence = ?,
          sanction_actioned_by = ?,
          sanction_actioned_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        request.reason,
        request.evidence,
        actor.username || actor.name,
        seller.id
      );

      // 3. Add to anti-fraud blacklist (IP, Email, Phone, Atelier Name)
      const insertBlacklist = db.prepare('INSERT OR IGNORE INTO blacklist (type, value, reason, created_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)');
      if (seller.email) insertBlacklist.run('email', seller.email.toLowerCase(), `Banned: ${request.reason}`);
      if (seller.phone) insertBlacklist.run('phone', seller.phone, `Banned: ${request.reason}`);
      if (seller.atelier_name) insertBlacklist.run('name', seller.atelier_name.toLowerCase(), `Banned: ${request.reason}`);

      // 4. Hide all active listings from this seller
      db.prepare(`
        UPDATE gemstone_listings SET
          status = 'hidden',
          updated_at = CURRENT_TIMESTAMP
        WHERE seller_id = ?
      `).run(seller.id);

      AuditService.log({
        actorId: actor.staffId || actor.id,
        actorRole: 'super_admin',
        eventType: 'SELLER_BANNED',
        entityType: 'seller_profile',
        entityId: seller.id,
        newValue: { requestId, reason: request.reason, adminNotes }
      });
    } else if (decision === 'reject') {
      db.prepare(`
        UPDATE ban_requests SET
          status = 'rejected',
          actioned_by = ?,
          actioned_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(actor.username || actor.name, requestId);

      AuditService.log({
        actorId: actor.staffId || actor.id,
        actorRole: 'super_admin',
        eventType: 'BAN_REQUEST_REJECTED',
        entityType: 'ban_request',
        entityId: requestId,
        newValue: { adminNotes }
      });
    } else {
      throw new Error("Invalid decision. Must be 'approve' or 'reject'.");
    }

    syncToJson();
    return { success: true, decision, requestId };
  }

  static getPendingBanRequests() {
    const db = getDb();
    return db.prepare(`
      SELECT b.*, s.atelier_name, s.email as seller_email, s.phone as seller_phone
      FROM ban_requests b
      LEFT JOIN seller_profiles s ON s.id = b.seller_id
      WHERE b.status = 'pending'
      ORDER BY b.created_at DESC
    `).all();
  }

  static getIncidentReports(sellerId = null) {
    const db = getDb();
    if (sellerId) {
      return db.prepare('SELECT * FROM moderation_reports WHERE seller_id = ? ORDER BY created_at DESC').all(sellerId);
    }
    return db.prepare(`
      SELECT r.*, s.atelier_name
      FROM moderation_reports r
      LEFT JOIN seller_profiles s ON s.id = r.seller_id
      ORDER BY r.created_at DESC
    `).all();
  }
}

module.exports = ModerationService;
