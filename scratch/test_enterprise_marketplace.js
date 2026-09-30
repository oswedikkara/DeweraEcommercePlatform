/**
 * Dewera Enterprise Marketplace - Comprehensive Automated Verification Suite
 * Tests 15 Enterprise Boundaries & Business Specifications
 * Zero emoji constraint strictly adhered to.
 */

const http = require('http');

const STORE_URL = 'http://localhost:3000';
const ADMIN_URL = 'http://localhost:3001';

function request(baseUrl, path, method = 'GET', data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const bodyStr = data ? JSON.stringify(data) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };
    if (bodyStr) {
      reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(url, { method, headers: reqHeaders }, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch {
          json = body;
        }
        resolve({ status: res.statusCode, data: json, headers: res.headers });
      });
    });

    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('--- DEWERA ENTERPRISE MARKETPLACE VERIFICATION SUITE ---');

  // 1. Staff Authentication
  console.log('\n[1. Authentication & Role Gateway]');
  const headLogin = await request(STORE_URL, '/api/staff/login', 'POST', { username: 'headadmin', password: 'dewera#2026' });
  assert(headLogin.status === 200 && headLogin.data.user.role === 'super_admin', 'Head Admin login succeeds');
  const headToken = headLogin.data.token;

  const adminLogin = await request(STORE_URL, '/api/staff/login', 'POST', { username: 'admin', password: 'admin#2026' });
  assert(adminLogin.status === 200 && adminLogin.data.user.role === 'admin', 'Senior Admin login succeeds');
  const adminToken = adminLogin.data.token;

  const modLogin = await request(STORE_URL, '/api/staff/login', 'POST', { username: 'moderator', password: 'mod#2026' });
  assert(modLogin.status === 200 && modLogin.data.user.role === 'moderator', 'Compliance Moderator login succeeds');
  const modToken = modLogin.data.token;

  // 2. Marketplace Master Toggle
  console.log('\n[2. Marketplace Master Toggle]');
  const unauthToggle = await request(STORE_URL, '/api/settings', 'POST', { marketplaceEnabled: false }, { 'x-staff-token': modToken });
  assert(unauthToggle.status === 403, 'Moderator blocked from toggling Marketplace mode (HTTP 403)');

  const headToggleOff = await request(STORE_URL, '/api/settings', 'POST', { marketplaceEnabled: false }, { 'x-staff-token': headToken });
  assert(headToggleOff.status === 200 && headToggleOff.data.settings.marketplaceEnabled === false, 'Head Admin disables Marketplace');

  // Verify public gems when toggle is OFF
  const publicGemsOff = await request(STORE_URL, '/api/gems', 'GET');
  const allDeweraWhenOff = publicGemsOff.data.every(g => g.isDewera === true || g.sellerId === 'dewera');
  assert(publicGemsOff.status === 200 && publicGemsOff.data.length > 0 && allDeweraWhenOff, 'Public catalog returns ONLY Dewera Sovereign gems when Marketplace is OFF');

  // Turn Marketplace back ON
  const headToggleOn = await request(STORE_URL, '/api/settings', 'POST', { marketplaceEnabled: true }, { 'x-staff-token': headToken });
  assert(headToggleOn.status === 200 && headToggleOn.data.settings.marketplaceEnabled === true, 'Head Admin enables Marketplace');

  const publicGemsOn = await request(STORE_URL, '/api/gems', 'GET');
  const hasMarketplace = publicGemsOn.data.some(g => g.isDewera === false && g.sellerId !== 'dewera');
  assert(publicGemsOn.status === 200 && hasMarketplace, 'Public catalog returns marketplace seller gems when Marketplace is ON');

  // 3. Confidentiality Shield (RBAC Isolation)
  console.log('\n[3. Confidentiality Shield & Sovereign Isolation]');
  const modGems = await request(STORE_URL, '/api/gems', 'GET', null, { 'x-staff-token': modToken });
  const modHasDewera = modGems.data.some(g => g.isDewera === true || g.sellerId === 'dewera');
  assert(modGems.status === 200 && !modHasDewera, 'Moderator cannot see Dewera Sovereign listings (0 Dewera gems returned)');

  const adminGems = await request(STORE_URL, '/api/gems', 'GET', null, { 'x-staff-token': adminToken });
  const adminHasDewera = adminGems.data.some(g => g.isDewera === true || g.sellerId === 'dewera');
  assert(adminGems.status === 200 && !adminHasDewera, 'Senior Admin cannot see Dewera Sovereign listings (0 Dewera gems returned)');

  const superGems = await request(STORE_URL, '/api/gems', 'GET', null, { 'x-staff-token': headToken });
  const superHasDewera = superGems.data.some(g => g.isDewera === true);
  const superHasMarket = superGems.data.some(g => g.isDewera === false);
  assert(superGems.status === 200 && superHasDewera && superHasMarket, 'Head Admin sees complete catalog (Dewera + Marketplace)');

  // 4. Protection Against Unauthorized Modification of Dewera Listings
  console.log('\n[4. Sovereign Listing Integrity Guard]');
  const modDeweraEdit = await request(STORE_URL, '/api/gems/update', 'POST', { id: 'gem-dewera-01', price: 99999 }, { 'x-staff-token': modToken });
  assert(modDeweraEdit.status === 403, 'Moderator blocked from modifying Dewera Sovereign listing (HTTP 403)');

  const adminDeweraEdit = await request(STORE_URL, '/api/gems/update', 'POST', { id: 'gem-dewera-01', price: 99999 }, { 'x-staff-token': adminToken });
  assert(adminDeweraEdit.status === 403, 'Senior Admin blocked from modifying Dewera Sovereign listing (HTTP 403)');

  // 5. Customer Inquiry Engine & WhatsApp Link Generation
  console.log('\n[5. Customer Inquiry & Concierge Engine]');
  const inqRes = await request(STORE_URL, '/api/inquiries', 'POST', {
    listingId: 'gem-dewera-01',
    customerName: 'Lord Harrington',
    customerEmail: 'harrington@mayfair.london',
    customerPhone: '+44 20 7946 0912',
    preferredContact: 'whatsapp',
    message: 'Requesting private viewing protocol in London.'
  });
  assert(inqRes.status === 200 && inqRes.data.inquiryId && inqRes.data.inquiryId.startsWith('DWR-INQ-'), 'Customer inquiry generates DWR-INQ identifier');
  assert(inqRes.data.whatsappUrl && inqRes.data.whatsappUrl.includes('DWR-INQ-'), 'Inquiry generates structured WhatsApp concierge link');

  // 6. Single-Use Purchase Reference & Verified Review Anti-Fraud
  console.log('\n[6. Verified Purchase Reference & Review Anti-Fraud]');
  const purchaseRes = await request(STORE_URL, '/api/purchases/create', 'POST', {
    listingId: 'gem-dewera-01',
    customerEmail: 'harrington@mayfair.london',
    amountUsd: 12500
  }, { 'x-staff-token': headToken });
  assert(purchaseRes.status === 200 && purchaseRes.data.purchaseReferenceId && purchaseRes.data.purchaseReferenceId.startsWith('DWR-PUR-'), 'Sale generates single-use DWR-PUR purchase reference');

  const purId = purchaseRes.data.purchaseReferenceId;
  const secToken = purchaseRes.data.securityToken;

  // Fake purchase reference must fail
  const fakeReview = await request(STORE_URL, '/api/reviews/submit', 'POST', {
    purchaseRefId: 'DWR-PUR-FAKE-000000',
    customerName: 'Imposter Reviewer',
    rating: 5,
    reviewText: 'This is a fraudulent review without purchase.'
  });
  assert(fakeReview.status === 400, 'Unverified review without authentic purchase reference is rejected (HTTP 400)');

  // Authentic verified review submission
  const validReview = await request(STORE_URL, '/api/reviews/submit', 'POST', {
    purchaseRefId: purId,
    securityToken: secToken,
    customerName: 'Lord Harrington',
    rating: 5,
    reviewText: 'Extraordinary corundum saturation. Handover conducted with absolute discretion.'
  });
  assert(validReview.status === 200 && validReview.data.isVerifiedPurchase === true, 'Verified purchase review accepted with verified badge');

  // Attempt to reuse the same purchase reference must fail
  const reuseReview = await request(STORE_URL, '/api/reviews/submit', 'POST', {
    purchaseRefId: purId,
    securityToken: secToken,
    customerName: 'Lord Harrington',
    rating: 5,
    reviewText: 'Attempting to reuse token for a second review.'
  });
  assert(reuseReview.status === 409, 'Reusing spent purchase reference is strictly rejected (HTTP 409)');

  // 7. Moderation Ban Request & Executive Adjudication Pipeline
  console.log('\n[7. Moderation Ban Request & Executive Adjudication]');
  const banReq = await request(STORE_URL, '/api/moderation/ban-request', 'POST', {
    sellerId: 'seller-muc7ap6d',
    reason: 'Repeated non-disclosure of fracture treatments',
    evidence: 'Spectroscopic lab test cert DWR-LAB-992'
  }, { 'x-staff-token': modToken });
  assert(banReq.status === 200 && banReq.data.requestId, 'Moderator submits formal ban dossier to Head Admin desk');

  const reqId = banReq.data.requestId;

  // Admin cannot adjudicate ban request (only Head Admin)
  const adminAdj = await request(STORE_URL, '/api/moderation/adjudicate', 'POST', {
    requestId: reqId,
    decision: 'approve'
  }, { 'x-staff-token': adminToken });
  assert(adminAdj.status === 403, 'Senior Admin blocked from executive ban adjudication (HTTP 403)');

  // Head Admin approves ban
  const headAdj = await request(STORE_URL, '/api/moderation/adjudicate', 'POST', {
    requestId: reqId,
    decision: 'approve'
  }, { 'x-staff-token': headToken });
  assert(headAdj.status === 200 && headAdj.data.success === true, 'Head Admin successfully adjudicates ban');

  // 8. Anti-Evasion Blacklist Registry Gate
  console.log('\n[8. Anti-Evasion Blacklist Registry Gate]');
  const evasionAttempt = await request(STORE_URL, '/api/sellers/register', 'POST', {
    atelierName: 'New Evasion Shop',
    email: 'evasion@banned.lk',
    phone: '+94 77 999 8888'
  });
  assert(evasionAttempt.status === 403, 'Registration with blacklisted atelier identity is rejected (HTTP 403)');

  console.log('\n========================================');
  console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
  console.log('========================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('[TEST CRASH]', err);
  process.exit(1);
});
