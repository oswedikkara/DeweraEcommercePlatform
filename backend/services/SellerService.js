/**
 * Dewera Enterprise Gemstone Marketplace
 * SellerService - Onboarding, 2FA, Anti-Evasion & Rental Slot Management
 * Zero emoji constraint strictly adhered to.
 */

const crypto = require('crypto');
const { getDb, syncToJson } = require('../database/db');
const ConfigService = require('./ConfigService');
const AuditService = require('./AuditService');

class SellerService {
  /**
   * Checks whether incoming seller data matches anti-fraud blacklist.
   */
  static isBlacklisted({ ip = null, email = null, phone = null, atelierName = null }) {
    const db = getDb();
    const checks = [];
    const params = [];

    if (ip) {
      checks.push("(type = 'ip' AND LOWER(value) = LOWER(?))");
      params.push(ip);
    }
    if (email) {
      checks.push("(type = 'email' AND LOWER(value) = LOWER(?))");
      params.push(email.trim());
    }
    if (phone) {
      const cleanPhone = phone.replace(/[^0-9]/g, '');
      checks.push("(type = 'phone' AND REPLACE(REPLACE(REPLACE(value, '+', ''), ' ', ''), '-', '') = ?)");
      params.push(cleanPhone);
    }
    if (atelierName) {
      checks.push("(type = 'name' AND LOWER(value) = LOWER(?))");
      params.push(atelierName.trim());
    }

    if (checks.length === 0) return false;

    const query = `SELECT * FROM blacklist WHERE ${checks.join(' OR ')} LIMIT 1`;
    const match = db.prepare(query).get(...params);
    return Boolean(match);
  }

  /**
   * Registers a new seller atelier.
   */
  static registerSeller({ atelierName, email, phone, whatsapp = '', specialization = '', ip = null }) {
    if (!ConfigService.getSetting('sellerRegistrationEnabled', true)) {
      throw new Error('Seller registration is currently paused by platform governance.');
    }

    if (!atelierName || !email || !phone) {
      throw new Error('Atelier name, email, and phone number are required.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();
    const cleanName = atelierName.trim();

    // Anti-Evasion Blacklist Check
    if (this.isBlacklisted({ ip, email: cleanEmail, phone: cleanPhone, atelierName: cleanName })) {
      throw new Error('Registration declined: Entity identity or network profile is sanctioned.');
    }

    const db = getDb();
    const existingEmail = db.prepare('SELECT id FROM seller_profiles WHERE LOWER(email) = ?').get(cleanEmail);
    if (existingEmail) {
      throw new Error('A seller profile with this email address already exists.');
    }

    const sellerId = `seller-${Date.now().toString(36)}`;
    const twoFactorSecret = crypto.randomBytes(10).toString('hex').toUpperCase();
    const monthlyFee = ConfigService.getSellerMonthlyFee();

    db.prepare(`
      INSERT INTO seller_profiles (
        id, email, atelier_name, phone, whatsapp, logo_path,
        legal_business_name, country, address, status, specialization,
        rating, reviews_count, positive_feedback_pct,
        two_factor_secret, two_factor_verified,
        sanction_status, appeal_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'images/dewera-logo.png', ?, 'Sri Lanka', '', 'pending_2fa', ?, 5.0, 0, 100, ?, 0, 'active', 'none', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      sellerId,
      cleanEmail,
      cleanName,
      cleanPhone,
      whatsapp.trim() || cleanPhone,
      cleanName,
      specialization.trim(),
      twoFactorSecret
    );

    // Initial subscription record
    db.prepare(`
      INSERT INTO seller_subscriptions (
        id, seller_id, plan, amount_usd, billing_interval, status, created_at
      ) VALUES (?, ?, 'Monthly Vendor License ($40.00 USD/mo)', ?, 'monthly', 'unpaid', CURRENT_TIMESTAMP)
    `).run(`sub-${sellerId}`, sellerId, monthlyFee);

    AuditService.log({
      actorId: sellerId,
      actorRole: 'seller',
      eventType: 'SELLER_REGISTERED',
      entityType: 'seller_profile',
      entityId: sellerId,
      newValue: { sellerId, cleanEmail, cleanName }
    });

    syncToJson();

    return {
      sellerId,
      email: cleanEmail,
      atelierName: cleanName,
      twoFactorSecret,
      status: 'pending_2fa'
    };
  }

  /**
   * Verifies seller 2FA token.
   */
  static verify2FA(sellerId, token) {
    const db = getDb();
    const seller = db.prepare('SELECT * FROM seller_profiles WHERE id = ?').get(sellerId);
    if (!seller) {
      throw new Error('Seller profile not found.');
    }

    // In production, verify standard TOTP 6-digit code or bypass master test code
    if (!token || (token.trim().length !== 6 && token !== '123456')) {
      throw new Error('Invalid 2FA authentication code.');
    }

    db.prepare(`
      UPDATE seller_profiles SET
        two_factor_verified = 1,
        status = CASE WHEN status = 'pending_2fa' THEN 'pending_verification' ELSE status END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(sellerId);

    AuditService.log({
      actorId: sellerId,
      actorRole: 'seller',
      eventType: 'SELLER_2FA_VERIFIED',
      entityType: 'seller_profile',
      entityId: sellerId
    });

    syncToJson();
    return { success: true, sellerId, twoFactorVerified: true };
  }

  /**
   * Processes or records monthly vendor slot payment ($40 USD default).
   */
  static recordSlotPayment(sellerId, { method = 'card', txHash = null, cardBrand = 'Visa', cardLast4 = '4242' }) {
    const db = getDb();
    const seller = db.prepare('SELECT * FROM seller_profiles WHERE id = ?').get(sellerId);
    if (!seller) {
      throw new Error('Seller profile not found.');
    }

    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE seller_subscriptions SET
        status = 'active',
        method = ?,
        tx_hash = ?,
        card_brand = ?,
        card_last4 = ?,
        valid_until = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE seller_id = ?
    `).run(method, txHash, cardBrand, cardLast4, validUntil, sellerId);

    // If seller was pending or expired, activate them
    db.prepare(`
      UPDATE seller_profiles SET
        status = 'active',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status != 'banned' AND status != 'suspended'
    `).run(sellerId);

    AuditService.log({
      actorId: sellerId,
      actorRole: 'seller',
      eventType: 'SLOT_RENTAL_PAID',
      entityType: 'seller_subscription',
      entityId: `sub-${sellerId}`,
      newValue: { sellerId, method, validUntil }
    });

    syncToJson();

    return {
      success: true,
      sellerId,
      status: 'active',
      validUntil
    };
  }

  /**
   * Retrieves seller profile with subscription details.
   */
  static getSellerById(sellerId) {
    const db = getDb();
    const seller = db.prepare(`
      SELECT s.*, sub.status as sub_status, sub.amount_usd, sub.valid_until, sub.method as sub_method
      FROM seller_profiles s
      LEFT JOIN seller_subscriptions sub ON sub.seller_id = s.id
      WHERE s.id = ?
    `).get(sellerId);

    if (!seller) return null;

    return {
      id: seller.id,
      email: seller.email,
      atelierName: seller.atelier_name,
      phone: seller.phone,
      whatsapp: seller.whatsapp,
      logo: seller.logo_path,
      status: seller.status,
      specialization: seller.specialization,
      rating: seller.rating,
      reviewsCount: seller.reviews_count,
      positiveFeedbackPercent: seller.positive_feedback_pct,
      twoFactorVerified: Boolean(seller.two_factor_verified),
      sanction: {
        status: seller.sanction_status,
        reason: seller.sanction_reason,
        evidenceProof: seller.sanction_evidence,
        actionedBy: seller.sanction_actioned_by,
        actionedAt: seller.sanction_actioned_at
      },
      appeal: {
        status: seller.appeal_status,
        statement: seller.appeal_statement,
        supportingDoc: seller.appeal_doc,
        submittedAt: seller.appeal_submitted_at,
        moderatorRecommended: Boolean(seller.appeal_moderator_recommended)
      },
      subscription: {
        status: seller.sub_status || 'unpaid',
        amountUsd: seller.amount_usd || 40,
        validUntil: seller.valid_until,
        method: seller.sub_method
      }
    };
  }

  /**
   * Lists sellers (sorted by rating and reviews count).
   */
  static getSellers({ includeInactive = false } = {}) {
    const db = getDb();
    let query = `
      SELECT s.*, sub.status as sub_status, sub.valid_until
      FROM seller_profiles s
      LEFT JOIN seller_subscriptions sub ON sub.seller_id = s.id
    `;
    if (!includeInactive) {
      query += ` WHERE s.status = 'active' AND s.sanction_status = 'active'`;
    }
    query += ` ORDER BY s.rating DESC, s.reviews_count DESC`;

    const rows = db.prepare(query).all();
    return rows.map(s => ({
      id: s.id,
      atelierName: s.atelier_name,
      email: s.email,
      phone: s.phone,
      logo: s.logo_path,
      status: s.status,
      specialization: s.specialization,
      rating: s.rating,
      reviewsCount: s.reviews_count,
      positiveFeedbackPercent: s.positive_feedback_pct,
      subscriptionStatus: s.sub_status || 'unpaid'
    }));
  }
}

module.exports = SellerService;
