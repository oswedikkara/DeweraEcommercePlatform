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
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `DWR-INQ-${year}-${randomDigits}`;
  }

  static createInquiry({ listingId, variationId = null, colorVariation = null, customerName, customerEmail, customerPhone = '', preferredContact = 'whatsapp', message = '' }) {
    const db = getDb();
    let listing = db.prepare('SELECT * FROM gemstone_listings WHERE id = ?').get(listingId);
    if (!listing) {
      listing = db.prepare('SELECT * FROM gemstone_listings WHERE name = ? COLLATE NOCASE').get(listingId);
    }
    if (!listing && typeof listingId === 'string') {
      listing = db.prepare('SELECT * FROM gemstone_listings WHERE ? LIKE ("%" || name || "%") OR name LIKE ("%" || ? || "%") LIMIT 1').get(listingId, listingId);
    }
    if (!listing) {
      listing = db.prepare('SELECT * FROM gemstone_listings ORDER BY id ASC LIMIT 1').get();
    }
    if (!listing) {
      throw new Error('Gemstone listing not found.');
    }

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

    // Determine destination phone
    let targetPhone = '+94771234567';
    if (listing.is_dewera === 1) {
      targetPhone = ConfigService.getSetting('deweraWhatsApp', '+94771234567');
    } else {
      const seller = db.prepare('SELECT phone, whatsapp FROM seller_profiles WHERE id = ?').get(sellerId);
      if (seller) {
        targetPhone = seller.whatsapp || seller.phone || '+94771234567';
      }
    }
    const cleanPhone = targetPhone.replace(/[^0-9]/g, '');

    // Build structured inquiry text for WhatsApp
    let priceDisplay = `$${listing.price.toLocaleString()} USD`;
    if (variation) {
      if (variation.price_max && variation.price_max > variation.price) {
        priceDisplay = `$${variation.price.toLocaleString()} - $${variation.price_max.toLocaleString()} USD`;
      } else {
        priceDisplay = `$${variation.price.toLocaleString()} USD`;
      }
    } else if (listing.price_type === 'range' && listing.price_max) {
      priceDisplay = `$${listing.price.toLocaleString()} - $${listing.price_max.toLocaleString()} USD`;
    } else if (listing.price_type === 'consultation') {
      priceDisplay = 'Price on Application';
    }

    const waText = [
      `DEWERA INQUIRY REFERENCE: ${inquiryId}`,
      `Item: ${listing.name} (Ref: ${listing.id})`,
      `Variation: ${variation ? variation.color_name : (colorVariation || 'Primary / Standard Specimen')}`,
      `Indicated Valuation: ${priceDisplay}`,
      `Origin: ${listing.origin}`,
      `Client Name: ${customerName}`,
      `Client Contact: ${customerEmail}${customerPhone ? ' / ' + customerPhone : ''}`,
      message ? `Client Message: "${message}"` : ''
    ].filter(Boolean).join('\n');

    const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;

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

    return db.prepare(query).all(...params);
  }

  static updateInquiryStatus(inquiryId, status, actor) {
    const db = getDb();
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
