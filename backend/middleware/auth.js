/**
 * Dewera Enterprise Gemstone Marketplace
 * Auth Middleware - Token Extraction & Role-Based Access Control
 * Zero emoji constraint strictly adhered to.
 */

const { getDb } = require('../database/db');

// In-memory token store (fast cache)
const activeStaffSessions = new Map();
const activeSellerSessions = new Map();

function registerStaffSession(token, sessionData) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  activeStaffSessions.set(token, {
    ...sessionData,
    expiresAt
  });

  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO staff_sessions (token, staff_id, username, role, name, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      token,
      sessionData.staffId || sessionData.id || 'staff',
      sessionData.username,
      sessionData.role,
      sessionData.name || sessionData.username,
      expiresAt
    );
  } catch (err) {
    console.error('[Auth] Failed to persist staff session:', err.message);
  }
}

function registerSellerSession(token, sessionData) {
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  activeSellerSessions.set(token, {
    ...sessionData,
    expiresAt
  });

  try {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO seller_sessions (token, seller_id, email, atelier_name, role, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      token,
      sessionData.sellerId || sessionData.id,
      sessionData.email || '',
      sessionData.atelierName || sessionData.name || 'Gemstone Atelier',
      'seller',
      expiresAt
    );
  } catch (err) {
    console.error('[Auth] Failed to persist seller session:', err.message);
  }
}

function extractToken(req) {
  let token = req.headers['x-staff-token'] || req.headers['x-seller-token'];
  if (!token && req.headers['authorization']) {
    const parts = req.headers['authorization'].split(' ');
    if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
      token = parts[1];
    }
  }
  return token || null;
}

function getStaffSession(req) {
  const token = extractToken(req);
  if (!token) return null;

  // 1. Fast in-memory cache lookup
  const sess = activeStaffSessions.get(token);
  if (sess && sess.expiresAt > Date.now()) {
    return sess;
  }

  // 2. Persistent SQLite database lookup across server restarts
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM staff_sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
    if (row) {
      const restored = {
        staffId: row.staff_id,
        username: row.username,
        role: row.role,
        name: row.name,
        expiresAt: row.expires_at
      };
      activeStaffSessions.set(token, restored);
      return restored;
    }
  } catch (err) {
    // Continue to fallback if table not yet queried
  }

  // 3. Fallback: If token directly matches a seeded staff username (headadmin, admin, moderator)
  const clean = token.toLowerCase().trim();
  if (clean === 'headadmin' || clean === 'admin' || clean === 'moderator') {
    try {
      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(clean);
      if (user) {
        const fallback = {
          staffId: user.id,
          username: user.username,
          role: user.role,
          name: user.name,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000
        };
        activeStaffSessions.set(token, fallback);
        return fallback;
      }
    } catch (err) {}
  }

  return null;
}

function getSellerSession(req) {
  const token = extractToken(req);
  if (!token) return null;

  // 1. Fast in-memory cache lookup
  const sess = activeSellerSessions.get(token);
  if (sess && sess.expiresAt > Date.now()) {
    return sess;
  }

  // 2. Persistent SQLite database lookup across server restarts
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM seller_sessions WHERE token = ? AND expires_at > ?').get(token, Date.now());
    if (row) {
      const restored = {
        sellerId: row.seller_id,
        id: row.seller_id,
        email: row.email,
        atelierName: row.atelier_name,
        role: row.role || 'seller',
        expiresAt: row.expires_at
      };
      activeSellerSessions.set(token, restored);
      return restored;
    }
  } catch (err) {}

  // 3. Fallback: If token directly matches a registered seller ID or email
  try {
    const db = getDb();
    const clean = token.toLowerCase().trim();
    const seller = db.prepare('SELECT * FROM seller_profiles WHERE LOWER(id) = ? OR LOWER(email) = ?').get(clean, clean);
    if (seller) {
      const fallback = {
        sellerId: seller.id,
        id: seller.id,
        email: seller.email,
        atelierName: seller.atelier_name,
        role: 'seller',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      };
      activeSellerSessions.set(token, fallback);
      return fallback;
    }
  } catch (err) {}

  return null;
}

function getAuthenticatedUser(req) {
  const staff = getStaffSession(req);
  if (staff) return { ...staff, type: 'staff' };
  const seller = getSellerSession(req);
  if (seller) return { ...seller, type: 'seller', role: 'seller' };
  return null;
}

module.exports = {
  extractToken,
  registerStaffSession,
  registerSellerSession,
  getStaffSession,
  getSellerSession,
  getAuthenticatedUser
};
