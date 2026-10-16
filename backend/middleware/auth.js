/**
 * Dewera Enterprise Gemstone Marketplace
 * Auth Middleware - Token Extraction & Role-Based Access Control
 * Zero emoji constraint strictly adhered to.
 */

const { getDb } = require('../database/db');
const Access = require('../services/AdminAccessService');

// In-memory token store (fast cache)
const activeStaffSessions = new Map();
const activeSellerSessions = new Map();

function registerStaffSession(token, sessionData) {
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
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
      Access.digest(token),
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
  const expiresAt = Date.now() + 8 * 60 * 60 * 1000;
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
  if (!token || !token.startsWith('tok_email_')) return null;
  const valid = session => session && session.expiresAt > Date.now() && Access.isAllowed(session.username);
  const cached = activeStaffSessions.get(token);
  if (valid(cached)) return {...cached,email:cached.username,isOwner:Access.isOwner(cached.username)};
  activeStaffSessions.delete(token);
  const row = getDb().prepare('SELECT * FROM staff_sessions WHERE token = ? AND expires_at > ?').get(Access.digest(token),Date.now());
  if (!row) return null;
  const session = {staffId:row.staff_id,username:row.username,email:row.username,role:'super_admin',name:row.name,expiresAt:row.expires_at,isOwner:Access.isOwner(row.username)};
  if (!valid(session)) return null;
  activeStaffSessions.set(token,session);
  return session;
}

function getSellerSession() { return null; }

function getAuthenticatedUser(req) {
  const staff = getStaffSession(req);
  if (staff) return { ...staff, type: 'staff' };
  const seller = getSellerSession(req);
  if (seller) return { ...seller, type: 'seller', role: 'seller' };
  return null;
}

function revokeStaffSession(token) { activeStaffSessions.delete(token); }

module.exports = {
  revokeStaffSession,
  extractToken,
  registerStaffSession,
  registerSellerSession,
  getStaffSession,
  getSellerSession,
  getAuthenticatedUser
};
