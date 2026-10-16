/**
 * Dewera Enterprise Gemstone Marketplace
 * InquiryService - Public Customer Inquiries & Concierge Engine
 * Zero emoji constraint strictly adhered to.
 */

const crypto = require('crypto');
const { getDb } = require('../database/db');
const ConfigService = require('./ConfigService');
const AuditService = require('./AuditService');

class InquiryService {
  static generateInquiryId() {
    const year = new Date().getFullYear();
    const randomDigits = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `DWR-INQ-${year}-${randomDigits}`;
  }

  static createInquiry({ listingId, variationId = null, colorVariation = null, customerName, customerEmail, customerPhone = '', preferredContact = 'whatsapp', message = '' }) {
    const db = getDb();
    if (typeof customerName !== 'string' || !customerName.trim() || customerName.length > 120 ||
        typeof customerEmail !== 'string' || customerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
        typeof customerPhone !== 'string' || customerPhone.length > 40 ||
        typeof message !== 'string' || !message.trim() || message.length > 4000 ||
        !['email', 'whatsapp'].includes(preferredContact) || (preferredContact === 'whatsapp' && !customerPhone.trim())) {
      throw new Error('Please provide a valid name, email, message, and contact preference.');
    }
    if (!listingId) {
      db.exec(`CREATE TABLE IF NOT EXISTS general_inquiries (
        id TEXT PRIMARY KEY, customer_name TEXT NOT NULL, customer_email TEXT NOT NULL,
        customer_phone TEXT, preferred_contact TEXT, message TEXT, status TEXT DEFAULT 'new',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      const inquiryId = this.generateInquiryId();
      db.prepare('INSERT INTO general_inquiries (id, customer_name, customer_email, customer_phone, preferred_contact, message) VALUES (?, ?, ?, ?, ?, ?)')
        .run(inquiryId, customerName.trim(), customerEmail.trim(), customerPhone.trim(), preferredContact, message.trim());
      return { inquiryId, listingId: null, listingName: 'General enquiry', status: 'new', whatsappUrl:require('./ContactService').whatsapp({inquiryId,customerName,customerEmail,customerPhone,message}) };
    }
    if (typeof listingId !== 'string') throw new Error('Invalid gemstone reference.');
    const listing = db.prepare("SELECT * FROM gemstone_listings WHERE id = ? AND is_dewera = 1 AND status = 'available'").get(listingId);
    if (!listing) throw new Error('This gemstone is unavailable. Please contact Dewera for alternatives.');

    const effectiveListingId = listing.id;

    let variation = null;
    if (variationId) {
      variation = db.prepare('SELECT * FROM gemstone_variations WHERE id = ?').get(variationId);
      if (!variation) {
        variation = db.prepare('SELECT * FROM gemstone_variations WHERE listing_id = ? AND (color_name = ? COLLATE NOCASE OR id = ?)').get(effectiveListingId, variationId, variationId);
      }
    }
    if (!variation && colorVariation) {
      variation = db.prepare('SELECT * FROM gemstone_variations WHERE listing_id = ? AND (color_name = ? COLLATE NOCASE OR id = ?)').get(effectiveListingId, colorVariation, colorVariation);
    }

    const effectiveVariationId = variation ? variation.id : null;
    const inquiryId = this.generateInquiryId();
    const sellerId = listing.seller_id;

    db.prepare(`
      INSERT INTO inquiries (
        id, listing_id, seller_id, variation_id, customer_name,
        customer_email, customer_phone, preferred_contact, message, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      inquiryId,
      effectiveListingId,
      sellerId,
      effectiveVariationId,
      customerName.trim(),
      customerEmail.trim(),
      customerPhone.trim(),
      preferredContact,
      message.trim()
    );

    const targetPhone = require('./ContactService').details().whatsappNumber;
    const whatsappUrl = require('./ContactService').whatsapp({inquiryId,listingName:listing.name,customerName,customerEmail,customerPhone,message});

    AuditService.log({
      actorId: customerEmail,
      actorRole: 'customer',
      eventType: 'INQUIRY_CREATED',
      entityType: 'inquiry',
      entityId: inquiryId,
      newValue: { inquiryId, listingId, sellerId }
    });

    return {
      inquiryId,
      listingId,
      listingName: listing.name,
      whatsappUrl,
      targetPhone,
      status: 'new'
    };
  }

  static getInquiries({ user, listingId = null, sellerId = null, limit = 50 }) {
    const db = getDb();
    if (!user) {
      throw new Error('Authentication required to view inquiries.');
    }

    let query = `
      SELECT i.*, g.name as listing_name, g.is_dewera, s.atelier_name
      FROM inquiries i
      LEFT JOIN gemstone_listings g ON g.id = i.listing_id
      LEFT JOIN seller_profiles s ON s.id = i.seller_id
      WHERE 1=1
    `;
    const params = [];

    if (user.role === 'seller') {
      query += ' AND i.seller_id = ?';
      params.push(user.sellerId || user.id);
    } else if (user.role === 'admin' || user.role === 'moderator') {
      // Non-super admins cannot inspect Dewera sovereign inquiries
      query += ' AND g.is_dewera = 0';
      if (sellerId) {
        query += ' AND i.seller_id = ?';
        params.push(sellerId);
      }
    } else if (user.role === 'super_admin') {
      if (sellerId) {
        query += ' AND i.seller_id = ?';
        params.push(sellerId);
      }
    }

    if (listingId) {
      query += ' AND i.listing_id = ?';
      params.push(listingId);
    }

    query += ' ORDER BY i.created_at DESC LIMIT ?';
    params.push(limit);

    const inquiries = db.prepare(query).all(...params);
    const hasGeneral = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'general_inquiries'").get();
    if (user.role === 'super_admin' && !listingId && !sellerId && hasGeneral) {
      const general = db.prepare("SELECT *, 'General enquiry' as listing_name, 1 as is_dewera FROM general_inquiries ORDER BY created_at DESC LIMIT ?").all(limit);
      return [...inquiries, ...general].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, limit);
    }
    return inquiries;
  }

  static updateInquiryStatus(inquiryId, status, actor) {
    const db = getDb();
    const generalTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'general_inquiries'").get();
    const general = generalTable && db.prepare('SELECT id FROM general_inquiries WHERE id = ?').get(inquiryId);
    if (general) {
      if (actor.role !== 'super_admin') throw new Error('Access denied.');
      db.prepare('UPDATE general_inquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, inquiryId);
      return true;
    }
    const existing = db.prepare('SELECT * FROM inquiries WHERE id = ?').get(inquiryId);
    if (!existing) {
      throw new Error('Inquiry not found.');
    }

    if (actor.role === 'seller' && existing.seller_id !== (actor.sellerId || actor.id)) {
      throw new Error('Access denied: You cannot modify inquiries for another seller.');
    }

    db.prepare('UPDATE inquiries SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, inquiryId);

    AuditService.log({
      actorId: actor.staffId || actor.sellerId || actor.id || 'system',
      actorRole: actor.role,
      eventType: 'INQUIRY_STATUS_UPDATED',
      entityType: 'inquiry',
      entityId: inquiryId,
      oldValue: { status: existing.status },
      newValue: { status }
    });

    return true;
  }
}

module.exports = InquiryService;
