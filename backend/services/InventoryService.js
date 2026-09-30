/**
 * Dewera Enterprise Gemstone Marketplace
 * InventoryService - Inventory Management & Sovereign/Marketplace Isolation
 * Zero emoji constraint strictly adhered to.
 */

const { getDb, syncToJson } = require('../database/db');
const ConfigService = require('./ConfigService');
const AuditService = require('./AuditService');

class InventoryService {
  /**
   * Retrieves gemstone listings with RBAC & Marketplace Master Toggle filtering.
   * @param {Object} options
   * @param {Object} [options.user] - Authenticated user { role, staffId, username } or null for public
   * @param {string} [options.sellerId] - Filter by specific seller
   * @param {string} [options.status] - Filter by listing status
   * @param {boolean} [options.includeDewera] - Explicit filter
   */
  static getGems({ user = null, sellerId = null, status = null } = {}) {
    const db = getDb();
    const marketplaceEnabled = ConfigService.isMarketplaceEnabled();

    // 1. PUBLIC (Anonymous or regular customer)
    if (!user) {
      if (!marketplaceEnabled) {
        // Master Toggle OFF: Return ONLY Dewera Sovereign Gems
        const rows = db.prepare(`
          SELECT g.*, 
            (SELECT json_group_array(json_object(
              'id', v.id,
              'name', v.color_name,
              'code', v.color_code,
              'description', v.description,
              'carats', v.carat_weight,
              'price', v.price,
              'priceMax', v.price_max,
              'status', v.status
            )) FROM gemstone_variations v WHERE v.listing_id = g.id ORDER BY v.display_order ASC) as variations_json
          FROM gemstone_listings g
          WHERE g.is_dewera = 1 AND g.status = 'available'
          ORDER BY g.created_at DESC
        `).all();
        return rows.map(r => this.formatGemRow(r));
      }

      // Master Toggle ON: Return Dewera Gems + Approved Active Seller Gems
      const rows = db.prepare(`
        SELECT g.*, 
          s.atelier_name as seller_name,
          s.logo_path as seller_logo,
          s.rating as seller_rating,
          s.reviews_count as seller_reviews_count,
          s.positive_feedback_pct as seller_positive_pct,
          (SELECT json_group_array(json_object(
            'id', v.id,
            'name', v.color_name,
            'code', v.color_code,
            'description', v.description,
            'carats', v.carat_weight,
            'price', v.price,
            'priceMax', v.price_max,
            'status', v.status
          )) FROM gemstone_variations v WHERE v.listing_id = g.id ORDER BY v.display_order ASC) as variations_json
        FROM gemstone_listings g
        LEFT JOIN seller_profiles s ON s.id = g.seller_id
        WHERE (g.is_dewera = 1 AND g.status = 'available')
           OR (g.is_dewera = 0 AND g.status = 'available' AND (s.status = 'active' OR s.status = 'verified') AND s.sanction_status = 'active')
        ORDER BY g.created_at DESC
      `).all();
      return rows.map(r => this.formatGemRow(r));
    }

    // 2. STAFF RBAC
    // Super Admin: Has access to EVERYTHING (Dewera Sovereign + Marketplace)
    if (user.role === 'super_admin') {
      let query = `
        SELECT g.*, 
          s.atelier_name as seller_name,
          s.logo_path as seller_logo,
          s.rating as seller_rating,
          s.reviews_count as seller_reviews_count,
          s.positive_feedback_pct as seller_positive_pct,
          (SELECT json_group_array(json_object(
            'id', v.id,
            'name', v.color_name,
            'code', v.color_code,
            'description', v.description,
            'carats', v.carat_weight,
            'price', v.price,
            'priceMax', v.price_max,
            'status', v.status
          )) FROM gemstone_variations v WHERE v.listing_id = g.id ORDER BY v.display_order ASC) as variations_json
        FROM gemstone_listings g
        LEFT JOIN seller_profiles s ON s.id = g.seller_id
        WHERE 1=1
      `;
      const params = [];
      if (sellerId) {
        query += ' AND g.seller_id = ?';
        params.push(sellerId);
      }
      if (status) {
        query += ' AND g.status = ?';
        params.push(status);
      }
      query += ' ORDER BY g.created_at DESC';
      const rows = db.prepare(query).all(...params);
      return rows.map(r => this.formatGemRow(r));
    }

    // Admin & Moderator: Strict Confidentiality Shield
    // CANNOT SEE DEWERA SOVEREIGN GEMS UNDER ANY CIRCUMSTANCES
    if (user.role === 'admin' || user.role === 'moderator') {
      let query = `
        SELECT g.*, 
          s.atelier_name as seller_name,
          s.logo_path as seller_logo,
          s.rating as seller_rating,
          s.reviews_count as seller_reviews_count,
          s.positive_feedback_pct as seller_positive_pct,
          (SELECT json_group_array(json_object(
            'id', v.id,
            'name', v.color_name,
            'code', v.color_code,
            'description', v.description,
            'carats', v.carat_weight,
            'price', v.price,
            'priceMax', v.price_max,
            'status', v.status
          )) FROM gemstone_variations v WHERE v.listing_id = g.id ORDER BY v.display_order ASC) as variations_json
        FROM gemstone_listings g
        LEFT JOIN seller_profiles s ON s.id = g.seller_id
        WHERE g.is_dewera = 0
      `;
      const params = [];
      if (sellerId) {
        query += ' AND g.seller_id = ?';
        params.push(sellerId);
      }
      if (status) {
        query += ' AND g.status = ?';
        params.push(status);
      }
      query += ' ORDER BY g.created_at DESC';
      const rows = db.prepare(query).all(...params);
      return rows.map(r => this.formatGemRow(r));
    }

    // 3. SELLER ROLE
    if (user.role === 'seller' || user.sellerId) {
      const activeSellerId = user.sellerId || user.id;
      const rows = db.prepare(`
        SELECT g.*, 
          s.atelier_name as seller_name,
          s.logo_path as seller_logo,
          s.rating as seller_rating,
          s.reviews_count as seller_reviews_count,
          s.positive_feedback_pct as seller_positive_pct,
          (SELECT json_group_array(json_object(
            'id', v.id,
            'name', v.color_name,
            'code', v.color_code,
            'description', v.description,
            'carats', v.carat_weight,
            'price', v.price,
            'priceMax', v.price_max,
            'status', v.status
          )) FROM gemstone_variations v WHERE v.listing_id = g.id ORDER BY v.display_order ASC) as variations_json
        FROM gemstone_listings g
        LEFT JOIN seller_profiles s ON s.id = g.seller_id
        WHERE g.seller_id = ?
        ORDER BY g.created_at DESC
      `).all(activeSellerId);
      return rows.map(r => this.formatGemRow(r));
    }

    return [];
  }

  static getGemById(id, user = null) {
    const db = getDb();
    const row = db.prepare(`
      SELECT g.*, 
        s.atelier_name as seller_name,
        s.logo_path as seller_logo,
        s.rating as seller_rating,
        s.reviews_count as seller_reviews_count,
        s.positive_feedback_pct as seller_positive_pct,
        (SELECT json_group_array(json_object(
          'id', v.id,
          'name', v.color_name,
          'code', v.color_code,
          'description', v.description,
          'carats', v.carat_weight,
          'price', v.price,
          'priceMax', v.price_max,
          'status', v.status
        )) FROM gemstone_variations v WHERE v.listing_id = g.id ORDER BY v.display_order ASC) as variations_json
      FROM gemstone_listings g
      LEFT JOIN seller_profiles s ON s.id = g.seller_id
      WHERE g.id = ?
    `).get(id);

    if (!row) return null;

    // Confidentiality Shield check
    if (row.is_dewera === 1) {
      if (user && (user.role === 'admin' || user.role === 'moderator')) {
        return null; // Denied to Admins/Mods
      }
    }

    // Marketplace disabled check for public
    if (!user && row.is_dewera === 0 && !ConfigService.isMarketplaceEnabled()) {
      return null;
    }

    return this.formatGemRow(row);
  }

  static createListing(gemData, actor) {
    const db = getDb();

    // IDOR / RBAC checks
    const isDewera = (gemData.isDewera === true || gemData.sellerId === 'dewera' || actor.role === 'super_admin') ? 1 : 0;
    if (isDewera && actor.role !== 'super_admin') {
      throw new Error('Only Head Admin can create Dewera Sovereign listings.');
    }

    const id = gemData.id || `gem-${Date.now().toString(36)}`;
    const sellerId = isDewera ? 'dewera' : (gemData.sellerId || actor.sellerId || actor.staffId || actor.id || 'dewera');

    const insertStmt = db.prepare(`
      INSERT INTO gemstone_listings (
        id, seller_id, is_dewera, name, species, variety, treatment,
        origin, weight_carats, clarity, color, cut, shape, dimensions,
        price, price_max, price_type, discount_pct, sale_price, status,
        description, certificate_summary, gradient_from, gradient_to,
        images_json, highlights_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);

    insertStmt.run(
      id,
      sellerId,
      isDewera,
      gemData.name,
      gemData.species || gemData.type || 'Natural Corundum',
      gemData.variety || gemData.type || 'Sapphire',
      gemData.treatment || 'Heated',
      gemData.origin || 'Ratnapura, Sri Lanka',
      Number(gemData.weight || gemData.weight_carats || 1.0),
      gemData.clarity || 'Eye Clean',
      gemData.color || 'Vivid Blue',
      gemData.cut || 'Faceted',
      gemData.shape || 'Oval',
      gemData.dimensions || '',
      Number(gemData.price || 0),
      gemData.priceMax ? Number(gemData.priceMax) : null,
      gemData.priceType || 'exact',
      Number(gemData.discount || gemData.discount_pct || 0),
      gemData.salePrice ? Number(gemData.salePrice) : null,
      gemData.status || 'available',
      gemData.description || '',
      gemData.certificate || gemData.certificate_summary || '',
      gemData.gradientFrom || '#1A2B6D',
      gemData.gradientTo || '#2E4699',
      JSON.stringify(gemData.images || []),
      JSON.stringify(gemData.highlights || [])
    );

    // Save variations if present
    if (Array.isArray(gemData.colorVariations)) {
      const insertVar = db.prepare(`
        INSERT INTO gemstone_variations (
          id, listing_id, color_name, color_code, description, carat_weight,
          price, price_max, status, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let order = 0;
      for (const v of gemData.colorVariations) {
        insertVar.run(
          v.id || `${id}-var-${order}`,
          id,
          v.name || 'Standard Saturation',
          v.code || v.colorCode || '#1A2B6D',
          v.description || '',
          v.carats ? Number(v.carats) : null,
          v.price ? Number(v.price) : null,
          v.priceMax ? Number(v.priceMax) : null,
          v.status || 'available',
          order++
        );
      }
    }

    AuditService.log({
      actorId: actor.staffId || actor.sellerId || actor.id || 'system',
      actorRole: actor.role || 'system',
      eventType: 'LISTING_CREATED',
      entityType: 'gemstone_listing',
      entityId: id,
      newValue: { id, name: gemData.name, sellerId, isDewera }
    });

    syncToJson();
    return this.getGemById(id, actor);
  }

  static updateListing(id, updates, actor) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM gemstone_listings WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Gemstone listing not found.');
    }

    // Sovereign shield
    if (existing.is_dewera === 1 && actor.role !== 'super_admin') {
      throw new Error('Access denied: Only Head Admin can modify Dewera Sovereign listings.');
    }

    // IDOR check for sellers
    if (actor.role === 'seller' && existing.seller_id !== (actor.sellerId || actor.id)) {
      throw new Error('Access denied: You cannot edit another seller’s listing.');
    }

    const name = updates.name !== undefined ? updates.name : existing.name;
    const variety = updates.variety !== undefined ? updates.variety : (updates.type !== undefined ? updates.type : existing.variety);
    const species = updates.species !== undefined ? updates.species : existing.species;
    const treatment = updates.treatment !== undefined ? updates.treatment : existing.treatment;
    const origin = updates.origin !== undefined ? updates.origin : existing.origin;
    const weightCarats = updates.weight !== undefined ? Number(updates.weight) : (updates.weight_carats !== undefined ? Number(updates.weight_carats) : existing.weight_carats);
    const clarity = updates.clarity !== undefined ? updates.clarity : existing.clarity;
    const color = updates.color !== undefined ? updates.color : existing.color;
    const price = updates.price !== undefined ? Number(updates.price) : existing.price;
    const priceMax = updates.priceMax !== undefined ? (updates.priceMax ? Number(updates.priceMax) : null) : existing.price_max;
    const priceType = updates.priceType !== undefined ? updates.priceType : existing.price_type;
    const status = updates.status !== undefined ? updates.status : existing.status;
    const description = updates.description !== undefined ? updates.description : existing.description;
    const certificateSummary = updates.certificate !== undefined ? updates.certificate : (updates.certificate_summary !== undefined ? updates.certificate_summary : existing.certificate_summary);
    const imagesJson = updates.images !== undefined ? JSON.stringify(updates.images) : existing.images_json;

    db.prepare(`
      UPDATE gemstone_listings SET
        name = ?, variety = ?, species = ?, treatment = ?, origin = ?,
        weight_carats = ?, clarity = ?, color = ?, price = ?, price_max = ?,
        price_type = ?, status = ?, description = ?, certificate_summary = ?,
        images_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, variety, species, treatment, origin, weightCarats, clarity, color, price, priceMax, priceType, status, description, certificateSummary, imagesJson, id);

    // Update color variations if supplied
    if (Array.isArray(updates.colorVariations)) {
      db.prepare('DELETE FROM gemstone_variations WHERE listing_id = ?').run(id);
      const insertVar = db.prepare(`
        INSERT INTO gemstone_variations (
          id, listing_id, color_name, color_code, description, carat_weight,
          price, price_max, status, display_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      let order = 0;
      for (const v of updates.colorVariations) {
        insertVar.run(
          v.id || `${id}-var-${order}`,
          id,
          v.name || 'Standard Saturation',
          v.code || v.colorCode || '#1A2B6D',
          v.description || '',
          v.carats ? Number(v.carats) : null,
          v.price ? Number(v.price) : null,
          v.priceMax ? Number(v.priceMax) : null,
          v.status || 'available',
          order++
        );
      }
    }

    AuditService.log({
      actorId: actor.staffId || actor.sellerId || actor.id || 'system',
      actorRole: actor.role || 'system',
      eventType: 'LISTING_UPDATED',
      entityType: 'gemstone_listing',
      entityId: id,
      oldValue: { name: existing.name, price: existing.price, status: existing.status },
      newValue: { name, price, status }
    });

    syncToJson();
    return this.getGemById(id, actor);
  }

  static deleteListing(id, actor) {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM gemstone_listings WHERE id = ?').get(id);
    if (!existing) {
      throw new Error('Listing not found.');
    }

    if (existing.is_dewera === 1 && actor.role !== 'super_admin') {
      throw new Error('Access denied: Only Head Admin can delete Dewera Sovereign listings.');
    }

    if (actor.role === 'seller' && existing.seller_id !== (actor.sellerId || actor.id)) {
      throw new Error('Access denied: You cannot delete another seller’s listing.');
    }

    db.prepare('DELETE FROM gemstone_listings WHERE id = ?').run(id);

    AuditService.log({
      actorId: actor.staffId || actor.sellerId || actor.id || 'system',
      actorRole: actor.role || 'system',
      eventType: 'LISTING_DELETED',
      entityType: 'gemstone_listing',
      entityId: id,
      oldValue: { id, name: existing.name, sellerId: existing.seller_id }
    });

    syncToJson();
    return true;
  }

  static formatGemRow(r) {
    const isDewera = Boolean(r.is_dewera);

    const SELLER_DIRECTORY = {
      'dewera': {
        name: 'House of Dewera',
        logo: 'images/dewera-logo.png',
        rating: 5.0,
        reviewsCount: 280,
        positiveFeedbackPercent: 100
      },
      'seller-001': {
        name: 'Ratnapura Imperial Gemmological Atelier',
        logo: 'images/seller-ratnapura.svg',
        rating: 4.98,
        reviewsCount: 142,
        positiveFeedbackPercent: 100
      },
      'seller-002': {
        name: 'Ceylon Sapphire Crown Curators',
        logo: 'images/seller-crown.svg',
        rating: 4.94,
        reviewsCount: 98,
        positiveFeedbackPercent: 99.2
      },
      'seller-003': {
        name: 'Sovereign Colombo Gem Vault',
        logo: 'images/seller-colombo.svg',
        rating: 4.95,
        reviewsCount: 89,
        positiveFeedbackPercent: 99
      }
    };

    let sellerName = r.seller_name;
    let sellerLogo = r.seller_logo;
    let sellerRating = r.seller_rating;
    let sellerReviewsCount = r.seller_reviews_count;
    let positiveFeedbackPercent = r.seller_positive_pct;

    if (isDewera) {
      sellerName = 'House of Dewera';
      sellerLogo = 'images/dewera-logo.png';
      sellerRating = 5.0;
      sellerReviewsCount = 280;
      positiveFeedbackPercent = 100;
    } else {
      const fallback = SELLER_DIRECTORY[r.seller_id] || {
        name: 'Verified Ceylon Merchant Atelier',
        logo: 'images/seller-ratnapura.svg',
        rating: 4.95,
        reviewsCount: 50,
        positiveFeedbackPercent: 100
      };
      if (!sellerName) sellerName = fallback.name;
      if (!sellerLogo) sellerLogo = fallback.logo;
      if (typeof sellerRating !== 'number') sellerRating = fallback.rating;
      if (typeof sellerReviewsCount !== 'number') sellerReviewsCount = fallback.reviewsCount;
      if (typeof positiveFeedbackPercent !== 'number') positiveFeedbackPercent = fallback.positiveFeedbackPercent;
    }

    return {
      id: r.id,
      sellerId: r.seller_id,
      sellerName,
      sellerLogo,
      sellerRating,
      sellerReviewsCount,
      positiveFeedbackPercent,
      isDewera,
      name: r.name,
      type: r.variety || r.species || 'Sapphire',
      species: r.species,
      variety: r.variety,
      treatment: r.treatment,
      origin: r.origin,
      weight: r.weight_carats,
      color: r.color,
      clarity: r.clarity,
      cut: r.cut,
      shape: r.shape,
      dimensions: r.dimensions,
      price: r.price,
      priceMax: r.price_max,
      priceType: r.price_type,
      discount: r.discount_pct,
      salePrice: r.sale_price,
      status: r.status,
      description: r.description,
      certificate: r.certificate_summary,
      gradientFrom: r.gradient_from,
      gradientTo: r.gradient_to,
      images: JSON.parse(r.images_json || '[]'),
      highlights: JSON.parse(r.highlights_json || '[]'),
      colorVariations: JSON.parse(r.variations_json || '[]'),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  }
}

module.exports = InventoryService;
