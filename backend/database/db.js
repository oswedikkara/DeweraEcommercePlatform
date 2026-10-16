/**
 * Dewera Enterprise Gemstone Marketplace
 * Relational SQLite Database Layer
 * Engine: node:sqlite (Native Node v24 DatabaseSync)
 * Zero emoji constraint strictly adhered to.
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'dewera.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    initDb();
  }
  return dbInstance;
}

function initDb() {
  if (dbInstance) return dbInstance;

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  dbInstance = new DatabaseSync(DB_PATH);
  dbInstance.exec('PRAGMA foreign_keys = ON;');
  dbInstance.exec('PRAGMA journal_mode = WAL;');

  // Apply schema
  if (fs.existsSync(SCHEMA_PATH)) {
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    dbInstance.exec(schemaSql);
  }

  // Ensure staff_sessions and seller_sessions tables exist
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS staff_sessions (
      token TEXT PRIMARY KEY,
      staff_id TEXT NOT NULL,
      username TEXT NOT NULL,
      role TEXT NOT NULL,
      name TEXT,
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS seller_sessions (
      token TEXT PRIMARY KEY,
      seller_id TEXT NOT NULL,
      email TEXT NOT NULL,
      atelier_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'seller',
      expires_at INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  seedInitialData(dbInstance);
  return dbInstance;
}

function seedInitialData(db) {
  // 1. Seed Staff Users from staff.json if table is empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const staffPath = path.join(DATA_DIR, 'staff.json');
    if (fs.existsSync(staffPath)) {
      try {
        const staff = JSON.parse(fs.readFileSync(staffPath, 'utf8'));
        const insertUser = db.prepare(`
          INSERT OR REPLACE INTO users (id, username, role, name, salt, password_hash, created_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const u of staff) {
          insertUser.run(
            u.id || `staff-${Date.now()}`,
            u.username,
            u.role,
            u.name || u.username,
            u.salt || '',
            u.passwordHash,
            u.createdBy || 'system',
            u.createdAt || new Date().toISOString()
          );
        }
      } catch (err) {
        console.error('[DB] Error seeding staff:', err.message);
      }
    }
  }

  // 2. Seed Settings from settings.json if table is empty
  const settingsCount = db.prepare('SELECT COUNT(*) as count FROM platform_settings').get().count;
  if (settingsCount === 0) {
    const settingsPath = path.join(DATA_DIR, 'settings.json');
    let settingsData={marketplaceEnabled:false,maintenanceMode:false,sellerRegistrationEnabled:false,deweraEmail:'deweragems@gmail.com',deweraWhatsApp:'+94771210101'};
    if (fs.existsSync(settingsPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        settingsData = { ...settingsData, ...existing };
        if (settingsData.marketplaceEnabled === undefined) {
          settingsData.marketplaceEnabled = false;
        }
      } catch (err) {
        console.error('[DB] Error reading existing settings.json:', err.message);
      }
    }
    const insertSetting = db.prepare(`
      INSERT OR REPLACE INTO platform_settings (key, value_json, updated_by, updated_at)
      VALUES (?, ?, 'system', CURRENT_TIMESTAMP)
    `);
    for (const [k, v] of Object.entries(settingsData)) {
      insertSetting.run(k, JSON.stringify(v));
    }
  }

  // 3. Seed Seller Profiles & Subscriptions
  const sellerCount = db.prepare('SELECT COUNT(*) as count FROM seller_profiles').get().count;
  if (sellerCount === 0) {
    const sellersPath = path.join(DATA_DIR, 'sellers.json');
    if (fs.existsSync(sellersPath)) {
      try {
        const sellers = JSON.parse(fs.readFileSync(sellersPath, 'utf8'));
        const insertSeller = db.prepare(`
          INSERT OR REPLACE INTO seller_profiles (
            id, email, atelier_name, phone, whatsapp, logo_path,
            legal_business_name, country, address, status, specialization,
            rating, reviews_count, positive_feedback_pct,
            two_factor_secret, two_factor_verified,
            sanction_status, sanction_reason, sanction_evidence,
            sanction_actioned_by, sanction_actioned_at,
            appeal_status, appeal_statement, appeal_doc,
            appeal_submitted_at, appeal_moderator_recommended,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertSub = db.prepare(`
          INSERT OR REPLACE INTO seller_subscriptions (
            id, seller_id, plan, amount_usd, billing_interval, status,
            method, tx_hash, card_brand, card_last4, receipt_url, wallet_type, valid_until, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const s of sellers) {
          const sub = s.subscription || {};
          const sanc = s.sanction || {};
          const app = s.appeal || {};
          const card = sub.cardDetails || {};

          insertSeller.run(
            s.id,
            s.email,
            s.atelierName || s.name || 'Gemstone Atelier',
            s.phone || '',
            s.whatsapp || s.phone || '',
            s.logo || 'images/dewera-logo.png',
            s.legalBusinessName || s.atelierName || '',
            s.country || 'Sri Lanka',
            s.address || '',
            s.status || 'pending_verification',
            s.specialization || '',
            typeof s.rating === 'number' ? s.rating : 5.0,
            typeof s.reviewsCount === 'number' ? s.reviewsCount : 0,
            typeof s.positiveFeedbackPercent === 'number' ? s.positiveFeedbackPercent : 100,
            s.twoFactorSecret || '',
            s.twoFactorVerified ? 1 : 0,
            sanc.status || 'active',
            sanc.reason || null,
            sanc.evidenceProof || null,
            sanc.actionedBy || null,
            sanc.actionedAt || null,
            app.status || 'none',
            app.statement || null,
            app.supportingDoc || null,
            app.submittedAt || null,
            app.moderatorRecommended ? 1 : 0,
            s.createdAt || new Date().toISOString(),
            s.updatedAt || new Date().toISOString()
          );

          insertSub.run(
            `sub-${s.id}`,
            s.id,
            sub.plan || 'Monthly Vendor License ($40.00 USD/mo)',
            typeof sub.amountUsd === 'number' ? sub.amountUsd : 40.0,
            'monthly',
            sub.status || 'unpaid',
            sub.method || null,
            sub.txHash || null,
            card.brand || null,
            card.last4 || null,
            sub.receipt || null,
            sub.walletType || null,
            sub.validUntil || null,
            s.createdAt || new Date().toISOString()
          );
        }
      } catch (err) {
        console.error('[DB] Error seeding sellers:', err.message);
      }
    }
  }

  // 4. Seed Gemstone Listings and Variations
  const gemCount = db.prepare('SELECT COUNT(*) as count FROM gemstone_listings').get().count;
  if (gemCount === 0) {
    const gemsPath = path.join(DATA_DIR, 'gems.json');
    if (fs.existsSync(gemsPath)) {
      try {
        const gems = JSON.parse(fs.readFileSync(gemsPath, 'utf8'));
        const insertGem = db.prepare(`
          INSERT OR REPLACE INTO gemstone_listings (
            id, seller_id, is_dewera, name, species, variety, treatment,
            origin, weight_carats, clarity, color, cut, shape, dimensions,
            price, price_max, price_type, discount_pct, sale_price, status,
            description, certificate_summary, gradient_from, gradient_to,
            images_json, highlights_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertVar = db.prepare(`
          INSERT OR REPLACE INTO gemstone_variations (
            id, listing_id, color_name, color_code, description, carat_weight,
            price, price_max, status, display_order
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const g of gems) {
          const isDewera = g.isDewera === true || g.id.startsWith('gem-dewera-') ? 1 : 0;
          const sellerId = isDewera ? 'dewera' : (g.sellerId || 'seller-001');

          insertGem.run(
            g.id,
            sellerId,
            isDewera,
            g.name,
            g.species || g.type || 'Natural Corundum',
            g.variety || g.type || 'Sapphire',
            g.treatment || 'Heated',
            g.origin || 'Ratnapura, Sri Lanka',
            Number(g.weight || 1.0),
            g.clarity || 'Eye Clean',
            g.color || 'Royal Blue',
            g.cut || 'Faceted',
            g.shape || 'Oval',
            g.dimensions || '',
            Number(g.price || 0),
            g.priceMax ? Number(g.priceMax) : null,
            g.priceType || 'exact',
            Number(g.discount || 0),
            g.salePrice ? Number(g.salePrice) : null,
            g.status || 'available',
            g.description || '',
            g.certificate || '',
            g.gradientFrom || '#1A2B6D',
            g.gradientTo || '#2E4699',
            JSON.stringify(g.images || []),
            JSON.stringify(g.highlights || []),
            g.createdAt || new Date().toISOString(),
            g.updatedAt || new Date().toISOString()
          );

          if (Array.isArray(g.colorVariations)) {
            let order = 0;
            for (const v of g.colorVariations) {
              insertVar.run(
                v.id || `${g.id}-var-${order}`,
                g.id,
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
        }
      } catch (err) {
        console.error('[DB] Error seeding gems:', err.message);
      }
    }
  }

  // 5. Seed Blacklist from blacklist.json
  const blacklistPath = path.join(DATA_DIR, 'blacklist.json');
  if (fs.existsSync(blacklistPath)) {
    try {
      const bl = JSON.parse(fs.readFileSync(blacklistPath, 'utf8'));
      if (Array.isArray(bl)) {
        const insertBl = db.prepare('INSERT OR IGNORE INTO blacklist (type, value, reason, created_at) VALUES (?, ?, ?, ?)');
        for (const item of bl) {
          insertBl.run(item.type || 'ip', item.value, item.reason || '', item.createdAt || new Date().toISOString());
        }
      }
    } catch (err) {
      console.error('[DB] Error seeding blacklist:', err.message);
    }
  }
}

/**
 * Synchronizes SQLite tables back to legacy JSON files for real-time backup and backward compatibility.
 */
function syncToJson() {
  const db = getDb();

  try {
    // 1. Export Gems
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
      ORDER BY g.created_at DESC
    `).all();

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

    const gems = rows.map(r => {
      const isDewera = Boolean(r.is_dewera);
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
    });

    const gemsJson = JSON.stringify(gems, null, 2);
    fs.writeFileSync(path.join(DATA_DIR, 'gems.json'), gemsJson, 'utf8');
    const storeGemsPath = path.join(PROJECT_ROOT, 'store', 'gems.json');
    const adminGemsPath = path.join(PROJECT_ROOT, 'admin', 'gems.json');
    if (fs.existsSync(path.dirname(storeGemsPath))) fs.writeFileSync(storeGemsPath, gemsJson, 'utf8');
    if (fs.existsSync(path.dirname(adminGemsPath))) fs.writeFileSync(adminGemsPath, gemsJson, 'utf8');

    // 2. Export Sellers
    const sellerRows = db.prepare(`
      SELECT s.*, 
        sub.plan as sub_plan, sub.amount_usd as sub_amount_usd, sub.status as sub_status,
        sub.method as sub_method, sub.tx_hash as sub_tx_hash, sub.card_brand as sub_card_brand,
        sub.card_last4 as sub_card_last4, sub.receipt_url as sub_receipt_url,
        sub.wallet_type as sub_wallet_type, sub.valid_until as sub_valid_until
      FROM seller_profiles s
      LEFT JOIN seller_subscriptions sub ON sub.seller_id = s.id
    `).all();

    const sellers = sellerRows.map(s => ({
      id: s.id,
      email: s.email,
      atelierName: s.atelier_name,
      phone: s.phone,
      whatsapp: s.whatsapp,
      logo: s.logo_path,
      legalBusinessName: s.legal_business_name,
      country: s.country,
      address: s.address,
      status: s.status,
      specialization: s.specialization,
      rating: s.rating,
      reviewsCount: s.reviews_count,
      positiveFeedbackPercent: s.positive_feedback_pct,
      twoFactorSecret: s.two_factor_secret,
      twoFactorVerified: Boolean(s.two_factor_verified),
      sanction: {
        status: s.sanction_status,
        reason: s.sanction_reason,
        evidenceProof: s.sanction_evidence,
        actionedBy: s.sanction_actioned_by,
        actionedAt: s.sanction_actioned_at
      },
      appeal: {
        status: s.appeal_status,
        statement: s.appeal_statement,
        supportingDoc: s.appeal_doc,
        submittedAt: s.appeal_submitted_at,
        moderatorRecommended: Boolean(s.appeal_moderator_recommended)
      },
      subscription: {
        plan: s.sub_plan || 'Monthly Vendor License ($40.00 USD/mo)',
        amountUsd: s.sub_amount_usd || 40,
        status: s.sub_status || 'unpaid',
        method: s.sub_method,
        txHash: s.sub_tx_hash,
        cardDetails: s.sub_card_last4 ? { brand: s.sub_card_brand, last4: s.sub_card_last4 } : null,
        receipt: s.sub_receipt_url,
        walletType: s.sub_wallet_type,
        validUntil: s.sub_valid_until
      },
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));

    fs.writeFileSync(path.join(DATA_DIR, 'sellers.json'), JSON.stringify(sellers, null, 2), 'utf8');

    // 3. Export Settings
    const settingRows = db.prepare('SELECT key, value_json FROM platform_settings').all();
    const settingsObj = {};
    for (const row of settingRows) {
      settingsObj[row.key] = JSON.parse(row.value_json);
    }
    fs.writeFileSync(path.join(DATA_DIR, 'settings.json'), JSON.stringify(settingsObj, null, 2), 'utf8');

    // 4. Export Staff
    const staffRows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
    const staffList = staffRows.map(u => ({
      id: u.id,
      username: u.username,
      role: u.role,
      name: u.name,
      salt: u.salt,
      passwordHash: u.password_hash,
      createdAt: u.created_at,
      createdBy: u.created_by
    }));
    fs.writeFileSync(path.join(DATA_DIR, 'staff.json'), JSON.stringify(staffList, null, 2), 'utf8');

    // 5. Export Blacklist
    const blacklistRows = db.prepare('SELECT type, value, reason, created_at FROM blacklist ORDER BY id ASC').all();
    const blacklist = blacklistRows.map(b => ({
      type: b.type,
      value: b.value,
      reason: b.reason,
      createdAt: b.created_at
    }));
    fs.writeFileSync(path.join(DATA_DIR, 'blacklist.json'), JSON.stringify(blacklist, null, 2), 'utf8');

  } catch (err) {
    console.error('[DB] Error during syncToJson:', err.message);
  }
}

function syncStaffToJson() {
  const db = getDb();
  const staffRows = db.prepare('SELECT * FROM users ORDER BY created_at ASC').all();
  const staffList = staffRows.map(u => ({
    id: u.id,
    username: u.username,
    role: u.role,
    name: u.name,
    salt: u.salt,
    passwordHash: u.password_hash,
    createdAt: u.created_at,
    createdBy: u.created_by
  }));
  fs.writeFileSync(path.join(DATA_DIR, 'staff.json'), JSON.stringify(staffList, null, 2), 'utf8');
}

module.exports = {
  getDb,
  initDb,
  syncToJson,
  syncStaffToJson
};

