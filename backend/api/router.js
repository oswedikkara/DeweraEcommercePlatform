/**
 * Dewera Enterprise Gemstone Marketplace
 * Unified API Router & Request Handler
 * Zero emoji constraint strictly adhered to.
 */

const { parse: parseUrl } = require('url');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const { getDb, syncToJson, syncStaffToJson } = require('../database/db');
const InventoryService = require('../services/InventoryService');
const ConfigService = require('../services/ConfigService');
const InquiryService = require('../services/InquiryService');
const ReviewService = require('../services/ReviewService');
const ModerationService = require('../services/ModerationService');
const SellerService = require('../services/SellerService');
const AuditService = require('../services/AuditService');
const { getStaffSession, getSellerSession, getAuthenticatedUser, registerStaffSession, registerSellerSession } = require('../middleware/auth');
const { validateImageBuffer } = require('../middleware/upload');

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-staff-token, x-seller-token'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error('Malformed JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Handles marketplace API requests. Returns true if request was handled.
 */
async function handleApiRequest(req, res) {
  const parsed = parseUrl(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method;

  // Global Maintenance Mode Guard (Public requests blocked, staff bypassed)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/staff') && !pathname.startsWith('/api/settings')) {
    if (ConfigService.isMaintenanceModeEnabled()) {
      const staff = getStaffSession(req);
      if (!staff) {
        sendJson(res, 503, {
          success: false,
          error: 'Dewera marketplace is currently undergoing scheduled platform maintenance. Please inspect back shortly.'
        });
        return true;
      }
    }
  }

  // 1. Staff Authentication: POST /api/staff/login
  if (pathname === '/api/staff/login' && method === 'POST') {
    try {
      const { username, password } = await parseJsonBody(req);
      if (!username || !password) {
        sendJson(res, 400, { success: false, error: 'Username and passcode are required.' });
        return true;
      }
      const db = getDb();
      const staff = db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
      if (!staff) {
        sendJson(res, 401, { success: false, error: 'Invalid terminal credentials.' });
        return true;
      }
      const computedHash = crypto.createHash('sha256').update((staff.salt || '') + password).digest('hex');
      if (computedHash !== staff.password_hash) {
        sendJson(res, 401, { success: false, error: 'Invalid terminal credentials.' });
        return true;
      }
      const token = 'tok_staff_' + crypto.randomBytes(32).toString('hex');
      const sessionData = {
        staffId: staff.id,
        username: staff.username,
        role: staff.role,
        name: staff.name
      };
      registerStaffSession(token, sessionData);
      AuditService.log({
        actorId: staff.id,
        actorRole: staff.role,
        eventType: 'STAFF_LOGIN_SUCCESS',
        entityType: 'users',
        entityId: staff.id
      });
      sendJson(res, 200, {
        success: true,
        token,
        user: sessionData
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 2. Staff Management: GET /api/staff
  if (pathname === '/api/staff' && method === 'GET') {
    const staff = getStaffSession(req);
    if (!staff) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    const db = getDb();
    const rows = db.prepare('SELECT id, username, role, name, created_at, created_by FROM users ORDER BY created_at ASC').all();
    const sanitized = rows.map(s => ({
      id: s.id,
      username: s.username,
      role: s.role,
      name: s.name,
      createdAt: s.created_at,
      createdBy: s.created_by
    }));
    sendJson(res, 200, sanitized);
    return true;
  }

  // 3. Staff Creation: POST /api/staff/create
  if (pathname === '/api/staff/create' && method === 'POST') {
    const sess = getStaffSession(req);
    if (!sess) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    if (sess.role !== 'super_admin' && sess.role !== 'admin') {
      sendJson(res, 403, { success: false, error: 'Access denied: Insufficient privileges.' });
      return true;
    }
    try {
      const { username, password, role, name } = await parseJsonBody(req);
      if (!username || !password || !role) {
        sendJson(res, 400, { success: false, error: 'Username, password, and role are required.' });
        return true;
      }
      const cleanUsername = username.trim().toLowerCase();
      if (cleanUsername.length < 3 || password.length < 4) {
        sendJson(res, 400, { success: false, error: 'Username must be at least 3 chars and password at least 4 chars.' });
        return true;
      }
      if (!['admin', 'moderator'].includes(role)) {
        sendJson(res, 400, { success: false, error: 'Role must be admin or moderator.' });
        return true;
      }
      const db = getDb();
      const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(cleanUsername);
      if (existing) {
        sendJson(res, 400, { success: false, error: 'Username already in use.' });
        return true;
      }
      const salt = 'salt_' + crypto.randomBytes(8).toString('hex');
      const passwordHash = crypto.createHash('sha256').update(salt + password).digest('hex');
      const newId = 'staff-' + Date.now().toString(36);
      const staffName = name || (role === 'admin' ? 'Senior Governance Admin' : 'Compliance Moderator');

      db.prepare(`
        INSERT INTO users (id, username, role, name, salt, password_hash, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(newId, cleanUsername, role, staffName, salt, passwordHash, sess.username);

      syncStaffToJson();

      AuditService.log({
        actorId: sess.staffId,
        actorRole: sess.role,
        eventType: 'STAFF_PROVISIONED',
        entityType: 'users',
        entityId: newId,
        newValue: { username: cleanUsername, role }
      });

      sendJson(res, 200, {
        success: true,
        staff: {
          id: newId,
          username: cleanUsername,
          role,
          name: staffName,
          createdBy: sess.username
        }
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 3b. Staff Revocation / Deletion: POST /api/staff/delete (Super Admin & Admin)
  if (pathname === '/api/staff/delete' && method === 'POST') {
    const sess = getStaffSession(req);
    if (!sess) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    if (sess.role !== 'super_admin' && sess.role !== 'admin') {
      sendJson(res, 403, { success: false, error: 'Access denied: Administrator clearance required to revoke staff accounts.' });
      return true;
    }
    try {
      const { staffId, id, username } = await parseJsonBody(req);
      const targetId = staffId || id;
      const db = getDb();
      const target = db.prepare('SELECT * FROM users WHERE id = ? OR LOWER(username) = LOWER(?)').get(targetId || '', username || '');
      if (!target) {
        sendJson(res, 404, { success: false, error: 'Staff account not found.' });
        return true;
      }
      if (target.role === 'super_admin') {
        sendJson(res, 403, { success: false, error: 'Sovereign Head Administrator account cannot be revoked.' });
        return true;
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(target.id);
      try {
        db.prepare('DELETE FROM staff_sessions WHERE staff_id = ?').run(target.id);
      } catch(e) {}
      syncStaffToJson();

      AuditService.log({
        actorId: sess.staffId,
        actorRole: sess.role,
        eventType: 'STAFF_REVOKED',
        entityType: 'users',
        entityId: target.id,
        newValue: { username: target.username, role: target.role }
      });

      sendJson(res, 200, { success: true, message: `Staff member @${target.username} revoked.` });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 3c. Staff Update / Edit: POST /api/staff/update (Super Admin & Admin)
  if (pathname === '/api/staff/update' && method === 'POST') {
    const sess = getStaffSession(req);
    if (!sess) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    if (sess.role !== 'super_admin' && sess.role !== 'admin') {
      sendJson(res, 403, { success: false, error: 'Access denied: Administrator clearance required to edit staff accounts.' });
      return true;
    }
    try {
      const { staffId, id, name, role, password } = await parseJsonBody(req);
      const targetId = staffId || id;
      const db = getDb();
      const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId || '');
      if (!target) {
        sendJson(res, 404, { success: false, error: 'Staff account not found.' });
        return true;
      }
      if (target.role === 'super_admin' && sess.role !== 'super_admin') {
        sendJson(res, 403, { success: false, error: 'Cannot modify Sovereign Head Administrator account.' });
        return true;
      }

      const updatedName = (name !== undefined && name.trim()) ? name.trim() : target.name;
      const updatedRole = (role && ['admin', 'moderator'].includes(role)) ? role : target.role;

      if (password && password.trim().length >= 4) {
        const salt = 'salt_' + crypto.randomBytes(8).toString('hex');
        const passwordHash = crypto.createHash('sha256').update(salt + password.trim()).digest('hex');
        db.prepare(`
          UPDATE users SET name = ?, role = ?, salt = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(updatedName, updatedRole, salt, passwordHash, target.id);
      } else {
        db.prepare(`
          UPDATE users SET name = ?, role = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(updatedName, updatedRole, target.id);
      }

      syncStaffToJson();

      AuditService.log({
        actorId: sess.staffId,
        actorRole: sess.role,
        eventType: 'STAFF_UPDATED',
        entityType: 'users',
        entityId: target.id,
        newValue: { name: updatedName, role: updatedRole }
      });

      sendJson(res, 200, {
        success: true,
        staff: {
          id: target.id,
          username: target.username,
          name: updatedName,
          role: updatedRole
        }
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 4. Platform Settings: GET /api/settings
  if (pathname === '/api/settings' && method === 'GET') {
    const settings = ConfigService.getAllSettings();
    sendJson(res, 200, settings);
    return true;
  }

  // 5. Platform Settings Update: POST /api/settings
  if (pathname === '/api/settings' && method === 'POST') {
    const staff = getStaffSession(req);
    if (!staff) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      if (body.marketplaceEnabled !== undefined && staff.role !== 'super_admin' && staff.role !== 'admin') {
        sendJson(res, 403, { success: false, error: 'Access denied: Administrator clearance required to toggle Marketplace Visibility.' });
        return true;
      }
      if (body.maintenanceMode !== undefined && staff.role !== 'super_admin' && staff.role !== 'admin') {
        sendJson(res, 403, { success: false, error: 'Access denied: Only Administrators can toggle Maintenance mode.' });
        return true;
      }
      if (body.sellerRegistrationEnabled !== undefined && staff.role !== 'super_admin' && staff.role !== 'admin') {
        sendJson(res, 403, { success: false, error: 'Access denied: Only Administrators can toggle Seller Registration.' });
        return true;
      }
      const updated = ConfigService.updateMultipleSettings(body, staff.username);
      AuditService.log({
        actorId: staff.staffId,
        actorRole: staff.role,
        eventType: 'SETTINGS_UPDATED',
        entityType: 'platform_settings',
        newValue: body
      });
      sendJson(res, 200, { success: true, settings: updated });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 6. Gemstone Listings: GET /api/gems
  if (pathname === '/api/gems' && method === 'GET') {
    const user = getAuthenticatedUser(req);
    const gems = InventoryService.getGems({
      user,
      sellerId: parsed.query.sellerId || null,
      status: parsed.query.status || null
    });
    sendJson(res, 200, gems);
    return true;
  }

  // 7. Gemstone Detail: GET /api/gems/:id
  const gemMatch = pathname.match(/^\/api\/gems\/([a-zA-Z0-9_-]+)$/);
  if (gemMatch && method === 'GET') {
    const gemId = gemMatch[1];
    const user = getAuthenticatedUser(req);
    const gem = InventoryService.getGemById(gemId, user);
    if (!gem) {
      sendJson(res, 404, { success: false, error: 'Gemstone not found or access restricted.' });
      return true;
    }
    sendJson(res, 200, gem);
    return true;
  }

  // 8. Create Listing: POST /api/gems
  if (pathname === '/api/gems' && method === 'POST') {
    const user = getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { success: false, error: 'Authentication required to create listings.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const listing = InventoryService.createListing(body, user);
      sendJson(res, 201, { success: true, gem: listing });
    } catch (err) {
      const code = err.message.includes('Only Head Admin') ? 403 : 400;
      sendJson(res, code, { success: false, error: err.message });
    }
    return true;
  }

  // 9. Update Listing: POST /api/gems/update
  if (pathname === '/api/gems/update' && method === 'POST') {
    const user = getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const { id, ...updates } = body;
      if (!id) {
        sendJson(res, 400, { success: false, error: 'Listing ID is required.' });
        return true;
      }
      const updated = InventoryService.updateListing(id, updates, user);
      sendJson(res, 200, { success: true, gem: updated });
    } catch (err) {
      const code = err.message.includes('Access denied') ? 403 : 400;
      sendJson(res, code, { success: false, error: err.message });
    }
    return true;
  }

  // 10. Delete Listing: POST /api/gems/delete or DELETE /api/gems/:id
  if ((pathname === '/api/gems/delete' && method === 'POST') || (gemMatch && method === 'DELETE')) {
    const user = getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return true;
    }
    try {
      let id = gemMatch ? gemMatch[1] : null;
      if (!id) {
        const body = await parseJsonBody(req);
        id = body.id;
      }
      InventoryService.deleteListing(id, user);
      sendJson(res, 200, { success: true, deleted: id });
    } catch (err) {
      const code = err.message.includes('Access denied') ? 403 : 400;
      sendJson(res, code, { success: false, error: err.message });
    }
    return true;
  }

  // 11. Customer Inquiries: POST /api/inquiries & POST /api/enquire
  if ((pathname === '/api/inquiries' || pathname === '/api/enquire') && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const customerName = body.customerName || body.name || 'Valued Client';
      const customerEmail = body.customerEmail || body.email || 'client@dewera.vault';
      const customerPhone = body.customerPhone || body.phone || '';
      const listingId = body.listingId || body.gemId || body.gemInterest || 'gem-dewera-01';
      const variationId = body.variationId || null;
      const colorVariation = body.colorVariation || body.color || null;
      const message = body.message || body.custodyPreference || '';

      const result = InquiryService.createInquiry({
        listingId,
        variationId,
        colorVariation,
        customerName,
        customerEmail,
        customerPhone,
        preferredContact: body.preferredContact || 'whatsapp',
        message
      });

      sendJson(res, 200, {
        success: true,
        refCode: result.inquiryId,
        inquiryId: result.inquiryId,
        whatsappUrl: result.whatsappUrl,
        message: 'Inquiry logged and concierge link generated.'
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 12. View Inquiries: GET /api/inquiries
  if (pathname === '/api/inquiries' && method === 'GET') {
    const user = getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return true;
    }
    try {
      const list = InquiryService.getInquiries({
        user,
        listingId: parsed.query.listingId || null,
        sellerId: parsed.query.sellerId || null
      });
      sendJson(res, 200, list);
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 13. Inquiry Status Update: POST /api/inquiries/:id/status
  const inqMatch = pathname.match(/^\/api\/inquiries\/([a-zA-Z0-9_-]+)\/status$/);
  if (inqMatch && method === 'POST') {
    const user = getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      InquiryService.updateInquiryStatus(inqMatch[1], body.status, user);
      sendJson(res, 200, { success: true, status: body.status });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 14. Verified Purchase Reference Token Generator: POST /api/purchases/create
  if (pathname === '/api/purchases/create' && method === 'POST') {
    const user = getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { success: false, error: 'Authentication required.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const result = ReviewService.createPurchaseReference({ ...body, actor: user });
      sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      const code = err.message.includes('Access denied') ? 403 : 400;
      sendJson(res, code, { success: false, error: err.message });
    }
    return true;
  }

  // 15. Verified Purchase Review Submission: POST /api/reviews/submit
  if (pathname === '/api/reviews/submit' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const result = ReviewService.submitReview(body);
      sendJson(res, 200, result);
    } catch (err) {
      const code = err.message.includes('already been redeemed') ? 409 : 400;
      sendJson(res, code, { success: false, error: err.message });
    }
    return true;
  }

  // 16. Reviews Retrieval: GET /api/reviews
  if (pathname === '/api/reviews' && method === 'GET') {
    const gemId = parsed.query.gemId;
    const sellerId = parsed.query.sellerId;
    if (gemId) {
      const reviews = ReviewService.getReviewsForListing(gemId);
      sendJson(res, 200, reviews);
      return true;
    }
    if (sellerId) {
      const reviews = ReviewService.getReviewsForSeller(sellerId);
      sendJson(res, 200, reviews);
      return true;
    }
    sendJson(res, 400, { success: false, error: 'gemId or sellerId query parameter is required.' });
    return true;
  }

  // 17. Moderation Reports & Ban Requests
  if (pathname === '/api/moderation/report' && method === 'POST') {
    const staff = getStaffSession(req);
    if (!staff) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const result = ModerationService.createIncidentReport({ ...body, moderator: staff });
      sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  if (pathname === '/api/moderation/ban-request' && method === 'POST') {
    const staff = getStaffSession(req);
    if (!staff) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const result = ModerationService.submitBanRequest({ ...body, moderator: staff });
      sendJson(res, 200, { success: true, ...result });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  if (pathname === '/api/moderation/ban-requests' && method === 'GET') {
    const staff = getStaffSession(req);
    if (!staff) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    const list = ModerationService.getPendingBanRequests();
    sendJson(res, 200, list);
    return true;
  }

  if (pathname === '/api/moderation/adjudicate' && method === 'POST') {
    const staff = getStaffSession(req);
    if (!staff) {
      sendJson(res, 401, { success: false, error: 'Unauthorized staff session.' });
      return true;
    }
    if (staff.role !== 'super_admin') {
      sendJson(res, 403, { success: false, error: 'Access denied: Ban adjudication reserved exclusively for Head Admin.' });
      return true;
    }
    try {
      const body = await parseJsonBody(req);
      const result = ModerationService.adjudicateBanRequest({ ...body, actor: staff });
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 18. Audit Logs: GET /api/audit-logs
  if (pathname === '/api/audit-logs' && method === 'GET') {
    const staff = getStaffSession(req);
    if (!staff || staff.role !== 'super_admin') {
      sendJson(res, 403, { success: false, error: 'Access denied: Audit logs reserved exclusively for Head Admin.' });
      return true;
    }
    const logs = AuditService.getRecentLogs(100, parsed.query.type || null);
    sendJson(res, 200, logs);
    return true;
  }

  // 19. Seller Registration & Slot Payment
  if ((pathname === '/api/sellers/register' || pathname === '/api/seller/register') && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      const result = SellerService.registerSeller({ ...body, ip });
      const sellerObj = {
        id: result.sellerId,
        atelierName: result.atelierName,
        email: result.email,
        twoFactorSecret: result.twoFactorSecret,
        status: result.status
      };
      sendJson(res, 200, { success: true, ...result, seller: sellerObj });
    } catch (err) {
      const code = err.message.includes('declined') || err.message.includes('sanctioned') ? 403 : 400;
      sendJson(res, code, { success: false, error: err.message });
    }
    return true;
  }

  if (pathname === '/api/sellers/verify-2fa' && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const result = SellerService.verify2FA(body.sellerId, body.code);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  if ((pathname === '/api/sellers/pay-slot' || pathname === '/api/seller/payment' || pathname === '/api/seller/card-payment') && method === 'POST') {
    try {
      const body = await parseJsonBody(req);
      const sellerId = body.sellerId || (body.seller && body.seller.id);
      const result = SellerService.recordSlotPayment(sellerId, body);
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 20. Seller Authentication: POST /api/seller/login & POST /api/sellers/login
  if ((pathname === '/api/seller/login' || pathname === '/api/sellers/login') && method === 'POST') {
    try {
      const { email, password } = await parseJsonBody(req);
      if (!email) {
        sendJson(res, 400, { success: false, error: 'Atelier email is required.' });
        return true;
      }
      const cleanEmail = email.toLowerCase().trim();
      const db = getDb();
      let sellerRow = db.prepare('SELECT * FROM seller_profiles WHERE LOWER(email) = ? OR LOWER(id) = ?').get(cleanEmail, cleanEmail);
      if (!sellerRow) {
        const sellersFile = path.join(__dirname, '..', '..', 'data', 'sellers.json');
        if (fs.existsSync(sellersFile)) {
          const sellers = JSON.parse(fs.readFileSync(sellersFile, 'utf8'));
          const s = sellers.find(x => (x.email && x.email.toLowerCase() === cleanEmail) || (x.id && x.id.toLowerCase() === cleanEmail));
          if (s) {
            sellerRow = {
              id: s.id,
              email: s.email,
              atelier_name: s.atelierName || s.name,
              status: s.status,
              two_factor_verified: s.twoFactorVerified ? 1 : 0
            };
          }
        }
      }
      if (!sellerRow) {
        sendJson(res, 401, { success: false, error: 'Atelier account not registered.' });
        return true;
      }

      const token = 'tok_seller_' + crypto.randomBytes(32).toString('hex');
      const sessionData = {
        sellerId: sellerRow.id,
        id: sellerRow.id,
        email: sellerRow.email,
        atelierName: sellerRow.atelier_name,
        role: 'seller',
        status: sellerRow.status,
        twoFactorVerified: Boolean(sellerRow.two_factor_verified)
      };

      registerSellerSession(token, sessionData);

      AuditService.log({
        actorId: sellerRow.id,
        actorRole: 'seller',
        eventType: 'SELLER_LOGIN_SUCCESS',
        entityType: 'seller_profile',
        entityId: sellerRow.id
      });

      const fullSeller = SellerService.getSellerById(sellerRow.id) || sessionData;

      sendJson(res, 200, {
        success: true,
        token,
        seller: fullSeller
      });
    } catch (err) {
      sendJson(res, 400, { success: false, error: err.message });
    }
    return true;
  }

  // 21. Sellers Directory: GET /api/sellers
  if (pathname === '/api/sellers' && method === 'GET') {
    try {
      const sellers = SellerService.getSellers({ includeInactive: true });
      sendJson(res, 200, sellers);
    } catch (err) {
      sendJson(res, 500, { success: false, error: err.message });
    }
    return true;
  }

  return false;
}

module.exports = {
  handleApiRequest
};
