/**
 * Dewera Enterprise Gemstone Marketplace
 * Unified API Router & Request Handler
 * Zero emoji constraint strictly adhered to.
 */


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
    'Content-Type': 'application/json'
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
  const requestUrl=new URL(req.url,'http://localhost');
  const parsed={pathname:requestUrl.pathname,query:Object.fromEntries(requestUrl.searchParams)};
  const pathname = parsed.pathname;
  const method = req.method;
  if (await require('./admin-auth').handle(req,res,pathname)) return true;
  if (pathname === '/api/contact' && method === 'GET') { sendJson(res,200,require('../services/ContactService').details()); return true; }
  if (pathname === '/api/config') { sendJson(res,410,{success:false,error:'Use Contact & maintenance in the management workspace.'}); return true; }

  if (/^\/api\/(payments?|checkout|wallets?|escrow)(?:\/|$)/.test(pathname)) { sendJson(res,410,{success:false,error:'Dewera is enquiry-only. Online payments are not offered.'}); return true; }
  if (await require('./content').handleContent(req, res, pathname)) return true;

  // Retire third-party seller access on both store and administration servers.
  if (/^\/api\/sellers?(?:\/|$)/.test(pathname) || req.headers['x-seller-token'] || /^Bearer tok_seller_/i.test(req.headers.authorization || '')) {
    sendJson(res, 410, { success: false, error: 'The external seller service has been retired.' });
    return true;
  }


  // Global Maintenance Mode Guard (Public requests blocked, staff bypassed)
  if (pathname.startsWith('/api/') && !pathname.startsWith('/api/staff') && !pathname.startsWith('/api/settings')) {
    if (ConfigService.isMaintenanceModeEnabled()) {
      const staff = getStaffSession(req);
      const preview = method === 'GET' && /^\/api\/gems(?:\/|$)/.test(pathname) && require('../services/PreviewService').valid(parsed.query.preview);
      if (!staff && !preview) {
        sendJson(res, 503, {
          success: false,
          error: 'The Dewera store is temporarily unavailable. Please contact the team for assistance.'
        });
        return true;
      }
    }
  }

  if(pathname==='/api/staff'){sendJson(res,410,{success:false,error:'Use approved-email access management.'});return true;}

  // 4. Platform Settings: GET /api/settings
  if (pathname === '/api/settings' && method === 'GET') {
    const settings = ConfigService.getAllSettings();
    sendJson(res, 200, getStaffSession(req) ? settings : {maintenanceMode:settings.maintenanceMode,marketplaceEnabled:false,sellerRegistrationEnabled:false});
    return true;
  }

  if(pathname==='/api/settings'&&method==='POST'){sendJson(res,410,{success:false,error:'Use the validated admin settings endpoint.'});return true;}

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
      const customerName = body.customerName || body.name || '';
      const customerEmail = body.customerEmail || body.email || '';
      const customerPhone = body.customerPhone || body.phone || '';
      const listingId = body.listingId || body.gemId || body.gemInterest || null;
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

  if (pathname.startsWith('/api/')) { sendJson(res,404,{success:false,error:'API endpoint not found.'}); return true; }
  return false;
}

module.exports = {
  handleApiRequest
};
