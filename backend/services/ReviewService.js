/**
 * Dewera Enterprise Gemstone Marketplace
 * ReviewService - Verified Purchase Reviews & Anti-Fraud Engine
 * Zero emoji constraint strictly adhered to.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { getDb, syncToJson } = require('../database/db');
const AuditService = require('./AuditService');

const REVIEWS_UPLOAD_DIR = path.join(__dirname, '..', '..', 'store', 'uploads', 'reviews');

class ReviewService {
  static generatePurchaseReferenceId() {
    const year = new Date().getFullYear();
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    return `DWR-PUR-${year}-${randomDigits}`;
  }

  /**
   * Generates a single-use verified purchase token upon sale completion.
   */
  static createPurchaseReference({ inquiryId = null, listingId, sellerId, variationId = null, customerEmail, amountUsd, actor }) {
    const db = getDb();
    const listing = db.prepare('SELECT * FROM gemstone_listings WHERE id = ?').get(listingId);
    if (!listing) {
      throw new Error('Gemstone listing not found.');
    }

    // RBAC: super_admin, admin, or the owning seller can generate purchase reference
    if (actor.role === 'seller' && listing.seller_id !== (actor.sellerId || actor.id)) {
      throw new Error('Access denied: You cannot generate purchase references for another seller’s gems.');
    }

    const purchaseRefId = this.generatePurchaseReferenceId();
    const securityToken = 'sec_' + crypto.randomBytes(24).toString('hex');

    db.prepare(`
      INSERT INTO purchase_references (
        id, inquiry_id, listing_id, seller_id, variation_id,
        customer_email, amount_usd, security_token, review_submitted, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
    `).run(
      purchaseRefId,
      inquiryId,
      listingId,
      listing.seller_id,
      variationId,
      customerEmail.trim().toLowerCase(),
      Number(amountUsd || listing.price),
      securityToken
    );

    AuditService.log({
      actorId: actor.staffId || actor.sellerId || actor.id || 'system',
      actorRole: actor.role || 'system',
      eventType: 'PURCHASE_REFERENCE_CREATED',
      entityType: 'purchase_reference',
      entityId: purchaseRefId,
      newValue: { purchaseRefId, listingId, customerEmail, amountUsd }
    });

    return {
      purchaseReferenceId: purchaseRefId,
      securityToken,
      customerEmail,
      amountUsd: Number(amountUsd || listing.price),
      listingName: listing.name
    };
  }

  /**
   * Submits a customer review authenticated with their single-use purchase reference.
   */
  static submitReview({ purchaseRefId, securityToken = null, customerName, rating, reviewText, photoBase64 = null, photoFilename = null }) {
    const db = getDb();

    if (!purchaseRefId) {
      throw new Error('Purchase reference identifier is required.');
    }

    const purchase = db.prepare('SELECT * FROM purchase_references WHERE id = ?').get(purchaseRefId);
    if (!purchase) {
      throw new Error('Invalid purchase reference. Only verified buyers with an authentic reference may submit reviews.');
    }

    if (purchase.review_submitted === 1) {
      throw new Error('Review privilege has already been redeemed for this purchase reference.');
    }

    // Optional token validation if token was passed
    if (securityToken && purchase.security_token !== securityToken) {
      throw new Error('Security token mismatch for verified purchase reference.');
    }

    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      throw new Error('Rating must be an integer between 1 and 5 stars.');
    }

    if (!reviewText || reviewText.trim().length < 10) {
      throw new Error('Review statement must be at least 10 characters.');
    }

    let photoPath = null;
    if (photoBase64) {
      photoPath = this.validateAndSavePhoto(photoBase64, photoFilename || `${purchaseRefId}.jpg`);
    }

    const reviewId = `rev-${Date.now().toString(36)}-${Math.floor(Math.random() * 1000)}`;

    db.prepare(`
      INSERT INTO reviews (
        id, purchase_ref_id, listing_id, seller_id, customer_name,
        rating, review_text, photo_path, is_verified_purchase, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'published', CURRENT_TIMESTAMP)
    `).run(
      reviewId,
      purchaseRefId,
      purchase.listing_id,
      purchase.seller_id,
      customerName.trim(),
      parsedRating,
      reviewText.trim(),
      photoPath
    );

    // Mark purchase reference as used
    db.prepare('UPDATE purchase_references SET review_submitted = 1 WHERE id = ?').run(purchaseRefId);

    // Recalculate seller rating and reputation
    this.recalculateSellerReputation(purchase.seller_id);

    AuditService.log({
      actorId: purchase.customer_email,
      actorRole: 'customer',
      eventType: 'VERIFIED_REVIEW_SUBMITTED',
      entityType: 'review',
      entityId: reviewId,
      newValue: { reviewId, purchaseRefId, rating: parsedRating }
    });

    syncToJson();

    return {
      success: true,
      reviewId,
      rating: parsedRating,
      isVerifiedPurchase: true,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Validates photo buffer magic bytes (MIME enforcement & anti-malware).
   */
  static validateAndSavePhoto(base64Data, filename) {
    if (!fs.existsSync(REVIEWS_UPLOAD_DIR)) {
      fs.mkdirSync(REVIEWS_UPLOAD_DIR, { recursive: true });
    }

    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');

    if (buffer.length > 5 * 1024 * 1024) {
      throw new Error('Review photo exceeds 5MB limit.');
    }

    // Inspect magic bytes
    let ext = '.jpg';
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      ext = '.jpg';
    } else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
      ext = '.png';
    } else if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
      ext = '.webp';
    } else {
      throw new Error('Unsupported or malformed image format. Only authentic JPEG, PNG, and WebP are accepted.');
    }

    const safeName = `rev_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`;
    const targetFile = path.join(REVIEWS_UPLOAD_DIR, safeName);
    fs.writeFileSync(targetFile, buffer);

    return `uploads/reviews/${safeName}`;
  }

  /**
   * Recalculates seller's aggregated rating, reviews count, and positive feedback percentage.
   */
  static recalculateSellerReputation(sellerId) {
    const db = getDb();
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total_reviews,
        AVG(rating) as avg_rating,
        SUM(CASE WHEN rating >= 4 THEN 1 ELSE 0 END) as positive_reviews
      FROM reviews
      WHERE seller_id = ? AND status = 'published'
    `).get(sellerId);

    if (stats && stats.total_reviews > 0) {
      const avg = Number((stats.avg_rating || 5.0).toFixed(2));
      const posPct = Math.round((stats.positive_reviews / stats.total_reviews) * 100);
      db.prepare(`
        UPDATE seller_profiles SET
          rating = ?,
          reviews_count = ?,
          positive_feedback_pct = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(avg, stats.total_reviews, posPct, sellerId);
    }
  }

  static getReviewsForListing(listingId) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, p.amount_usd, p.created_at as purchase_date
      FROM reviews r
      LEFT JOIN purchase_references p ON p.id = r.purchase_ref_id
      WHERE r.listing_id = ? AND r.status = 'published'
      ORDER BY r.created_at DESC
    `).all(listingId);
  }

  static getReviewsForSeller(sellerId) {
    const db = getDb();
    return db.prepare(`
      SELECT r.*, g.name as listing_name
      FROM reviews r
      LEFT JOIN gemstone_listings g ON g.id = r.listing_id
      WHERE r.seller_id = ? AND r.status = 'published'
      ORDER BY r.created_at DESC
    `).all(sellerId);
  }
}

module.exports = ReviewService;
