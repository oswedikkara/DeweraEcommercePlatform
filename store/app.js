/**
 * Dewera Natural Heated - Shared Data & Client Store
 * Certified Ceylon Natural Heated Gemstones
 */

const SEED_GEMS = [];

let _storeGemsCache = null;

function getGems() {
  if (_storeGemsCache && _storeGemsCache.length > 0) {
    return _storeGemsCache;
  }
  try {
    const d = localStorage.getItem('dewera_gems');
    if (d) {
      _storeGemsCache = JSON.parse(d);
      return _storeGemsCache;
    }
  } catch (e) {}
  _storeGemsCache = SEED_GEMS;
  return _storeGemsCache;
}

// ASYNC STOREFRONT GEMS SYNC FROM DATABASE
function fetchStoreGems(callback) {
  fetch('/api/gems')
    .then(r => r.json())
    .then(gems => {
      if (Array.isArray(gems)) {
        _storeGemsCache = gems;
        try {
          localStorage.setItem('dewera_gems', JSON.stringify(gems));
        } catch(e) {}
        window.dispatchEvent(new CustomEvent('dewera:gems_updated', { detail: gems }));
        if (typeof callback === 'function') callback(gems);
      }
    })
    .catch(() => {});
}

// Auto-sync immediately on script load
fetchStoreGems();

function isMarketplaceEnabled() {
  try {
    const s = localStorage.getItem('dewera_settings');
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed.marketplaceEnabled === false) return false;
    }
    const mkt = localStorage.getItem('dewera_marketplace_enabled');
    if (mkt === 'false') return false;
  } catch (e) {}
  return true;
}

function isMaintenanceMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === 'preview') return false;
  try {
    const s = localStorage.getItem('dewera_settings');
    if (s) {
      const parsed = JSON.parse(s);
      if (parsed.maintenanceMode === true) return true;
    }
    const maint = localStorage.getItem('dewera_maintenance_mode');
    if (maint === 'true') return true;
  } catch (e) {}
  return false;
}

function getPublicGems() {
  const mkt = isMarketplaceEnabled();
  return getGems().filter(g => {
    if (g.status === 'hidden') return false;
    if (!mkt) {
      return g.isDewera === true || g.sellerId === 'dewera' || !g.sellerId;
    }
    return true;
  });
}

function getGemById(id) {
  const gem = getGems().find(g => g.id === id);
  if (!gem) return null;
  if (!isMarketplaceEnabled() && !gem.isDewera && gem.sellerId && gem.sellerId !== 'dewera') {
    return null;
  }
  return gem;
}

function formatGemPrice(gem) {
  if (!gem) return '';
  if (gem.priceType === 'consultation' || (!gem.price && !gem.salePrice)) {
    return 'Valuation Upon Consultation';
  }
  if (gem.priceType === 'starting_from') {
    return 'From $' + Number(gem.price).toLocaleString() + ' USD';
  }
  if (gem.priceType === 'range' && gem.priceMax && gem.priceMax > gem.price) {
    return '$' + Number(gem.price).toLocaleString() + ' – $' + Number(gem.priceMax).toLocaleString() + ' USD';
  }
  if (gem.salePrice) {
    return '$' + Number(gem.salePrice).toLocaleString() + ' USD';
  }
  return '$' + Number(gem.price).toLocaleString() + ' USD';
}

function getGemHighlights(gem) {
  if (gem.highlights && Array.isArray(gem.highlights) && gem.highlights.length > 0) {
    return gem.highlights;
  }
  return [
    {
      category: 'Geological Provenance',
      title: 'Artisanal Alluvial Origin',
      description: 'Mined ethically from the legendary secondary gravel deposits of Sri Lanka (Ceylon), untouched by mechanical explosives.'
    },
    {
      category: 'Thermal Integrity',
      title: 'Permanent Heat Enhancement Only',
      description: 'Traditional atomic-level heating stabilizes true color depth with zero chemical additives, glass-filling, or dye.'
    },
    {
      category: 'Independent Certification',
      title: 'Gemological Lab Passport',
      description: 'Accompanied by an independent laboratory report verifying natural corundum identity and Ceylon provenance.'
    },
    {
      category: 'Direct Sourcing',
      title: '100% Pure Loose Gemstone',
      description: 'Preserved unmounted in our sealed security cassette for custody, investment, or bespoke jewelry mounting.'
    }
  ];
}

function gemCardHTML(gem) {
  const hasImg = gem.images && gem.images.length > 0;
  let imgSrc = hasImg ? gem.images[0] : '';
  if (imgSrc.endsWith('.jpg')) {
    imgSrc = imgSrc.replace(/\.jpg$/, '.png');
  }
  const imgContent = hasImg 
    ? '<img src="' + imgSrc + '" alt="' + gem.name + '" loading="lazy">' 
    : '';

  const discountPill = gem.discount 
    ? '<div class="apple-discount-pill">-' + gem.discount + '%</div>' 
    : '';

  const isSold = gem.status === 'sold';
  const isOutOfStock = gem.status === 'out-of-stock' || gem.status === 'out_of_stock';

  let statusBadge = '';
  if (isSold) {
    statusBadge = '<div class="apple-sold-badge">Acquired</div>';
  } else if (isOutOfStock) {
    statusBadge = '<div class="apple-outofstock-badge" style="background: rgba(180, 83, 9, 0.9); color: #FFFFFF; font-size: 0.65rem; letter-spacing: 0.08em;">Out of Stock &bull; Pit Sourcing</div>';
  }

  const tagline = gem.tagline || (gem.type + ' &bull; ' + gem.weight + ' Carats');
  const specLine = gem.weight + ' Carats &bull; ' + (gem.clarity || 'Eye Clean') + ' &bull; ' + gem.treatment;

  let priceHTML = '';
  if (gem.priceType === 'range' && gem.priceMax && gem.priceMax > gem.price) {
    priceHTML = '<div class="gem-card-price"><span style="font-size:0.62rem; letter-spacing:0.12em; text-transform:uppercase; color:var(--gold-dark); display:block; margin-bottom:2px; font-weight:600;">Market Range Guide</span>$' + Number(gem.price).toLocaleString() + ' &ndash; $' + Number(gem.priceMax).toLocaleString() + ' USD</div>';
  } else if (gem.priceType === 'starting_from') {
    priceHTML = '<div class="gem-card-price"><span style="font-size:0.62rem; letter-spacing:0.12em; text-transform:uppercase; color:var(--muted); display:block; margin-bottom:2px; font-weight:600;">Starting Valuation</span>From $' + Number(gem.price).toLocaleString() + ' USD</div>';
  } else if (gem.priceType === 'consultation') {
    priceHTML = '<div class="gem-card-price" style="font-size:0.8rem; color:var(--gold-dark); letter-spacing:0.06em; text-transform:uppercase; font-weight:600;">Valuation on Consultation</div>';
  } else if (gem.price) {
    if (gem.salePrice) {
      priceHTML = '<div class="gem-card-price"><span class="gem-card-price-old">$' + Number(gem.price).toLocaleString() + ' USD</span>$' + Number(gem.salePrice).toLocaleString() + ' USD</div>';
    } else {
      priceHTML = '<div class="gem-card-price">$' + Number(gem.price).toLocaleString() + ' USD</div>';
    }
  }

  let orderAction = '';
  if (isSold) {
    orderAction = '<span class="vault-link-acquired">Acquired</span>';
  } else if (isOutOfStock) {
    orderAction = '<a href="contact.html?gem=' + encodeURIComponent(gem.name) + '&sourcing=out_of_stock" class="vault-link-order" style="color: var(--gold-dark); font-weight: 600;">Request Sourcing &rsaquo;</a>';
  } else {
    orderAction = '<a href="contact.html?gem=' + encodeURIComponent(gem.name) + '" class="vault-link-order">Contact to Order &rsaquo;</a>';
  }

  let sellerBadgeHTML = '';
  const isDeweraSovereign = !gem.sellerId || gem.sellerId === 'dewera' || gem.isDewera;

  const SELLER_DIRECTORY = {
    'dewera': {
      name: 'House of Dewera',
      shortName: 'House of Dewera',
      logo: 'images/dewera-logo.png',
      rating: 5.0,
      reviewsCount: 280,
      positiveFeedbackPercent: 100
    },
    'seller-001': {
      name: 'Ratnapura Imperial Gemmological Atelier',
      shortName: 'Ratnapura Imperial Atelier',
      logo: 'images/seller-ratnapura.svg',
      rating: 4.98,
      reviewsCount: 142,
      positiveFeedbackPercent: 100
    },
    'seller-002': {
      name: 'Ceylon Sapphire Crown Curators',
      shortName: 'Ceylon Sapphire Crown',
      logo: 'images/seller-crown.svg',
      rating: 4.94,
      reviewsCount: 98,
      positiveFeedbackPercent: 99.2
    },
    'seller-003': {
      name: 'Sovereign Colombo Gem Vault',
      shortName: 'Sovereign Colombo Vault',
      logo: 'images/seller-colombo.svg',
      rating: 4.95,
      reviewsCount: 89,
      positiveFeedbackPercent: 99
    }
  };

  if (isDeweraSovereign) {
    sellerBadgeHTML = 
      '<div class="card-sovereign-seal" style="display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; margin: 6px 0 8px;">' +
        '<span style="height: 1px; flex: 1; background: linear-gradient(to right, transparent, rgba(201,169,110,0.35));"></span>' +
        '<span style="display: inline-flex; align-items: center; gap: 5px; font-family: \'Cinzel\', serif; font-size: 0.62rem; font-weight: 700; color: var(--gold-dark); letter-spacing: 0.12em; text-transform: uppercase;">' +
          '<img src="images/dewera-logo.png" alt="Dewera" style="height: 10px; width: auto; opacity: 0.85;">' +
          'House of Dewera &bull; Sovereign Vault' +
        '</span>' +
        '<span style="height: 1px; flex: 1; background: linear-gradient(to left, transparent, rgba(201,169,110,0.35));"></span>' +
      '</div>';
  } else {
    const sId = gem.sellerId || 'seller-001';
    const sFallback = SELLER_DIRECTORY[sId] || SELLER_DIRECTORY['seller-001'];
    const sName = gem.sellerName || sFallback.name;
    const sLogo = gem.sellerLogo || sFallback.logo;
    const ratingVal = gem.sellerRating ? Number(gem.sellerRating).toFixed(2) : String(sFallback.rating);
    const reviewsVal = gem.sellerReviewsCount || sFallback.reviewsCount;
    const posPct = gem.positiveFeedbackPercent ? (gem.positiveFeedbackPercent + '%') : (sFallback.positiveFeedbackPercent + '%');

    sellerBadgeHTML = 
      '<div class="card-seller-trust-bar" style="display: flex; align-items: center; justify-content: space-between; width: 100%; padding: 4px 8px; margin: 6px 0 8px; background: rgba(250, 248, 245, 0.85); border: 1px solid rgba(201, 169, 110, 0.22); box-sizing: border-box;">' +
        '<div style="display: flex; align-items: center; gap: 6px; min-width: 0;">' +
          '<img src="' + sLogo + '" alt="' + sName + '" style="width: 15px; height: 15px; object-fit: contain; border-radius: 0px; flex-shrink: 0;">' +
          '<span style="font-size: 0.64rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + sName + '</span>' +
        '</div>' +
        '<div style="display: flex; align-items: center; gap: 4px; font-size: 0.6rem; flex-shrink: 0; color: var(--muted); margin-left: 6px;">' +
          '<strong style="color: var(--gold-dark); font-weight: 700;">' + ratingVal + '</strong>' +
          '<span>(' + reviewsVal + ')</span>' +
          '<span style="color: #107C41; font-weight: 600;">&bull; ' + posPct + '</span>' +
        '</div>' +
      '</div>';
  }

  return '<div class="apple-gem-card">' +
    '<div class="apple-gem-visual-wrap">' +
      imgContent +
      discountPill +
      statusBadge +
    '</div>' +
    '<div class="apple-gem-card-body">' +
      '<div class="apple-gem-badge-top">' + gem.treatment + ' &bull; ' + gem.origin + '</div>' +
      '<h3 class="apple-gem-card-title">' + gem.name + '</h3>' +
      '<p class="apple-gem-card-tagline">' + tagline + '</p>' +
      '<div class="apple-gem-card-specs">' + specLine + '</div>' +
      '<div class="card-badge-slot">' + sellerBadgeHTML + '</div>' +
      priceHTML +
      '<div class="apple-gem-card-actions">' +
        '<a href="gem.html?id=' + gem.id + '" class="vault-btn-examine" style="padding: 6px 14px; font-size: 0.68rem;">Examine</a>' +
        orderAction +
      '</div>' +
    '</div>' +
  '</div>';
}

function checkMaintenanceMode() {
  const active = isMaintenanceMode();
  let settings = {};
  try {
    const s = localStorage.getItem('dewera_settings');
    if (s) settings = JSON.parse(s);
  } catch (e) {}
  applyMaintenanceOverlay(active, settings);
}

function applyMaintenanceOverlay(active, settings = {}) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('admin') === 'preview') return;

  let overlay = document.getElementById('deweraMaintenanceOverlay');
  if (active) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'deweraMaintenanceOverlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:#FAF8F5;z-index:999999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem;text-align:center;box-sizing:border-box;';
      const email = (settings && settings.deweraEmail) || localStorage.getItem('dewera_business_email') || 'deweragems@gmail.com';
      overlay.innerHTML = 
        '<div style="max-width:580px;margin:0 auto;">' +
          '<img src="images/dewera-logo.png" alt="DEWERA" style="height:26px;width:auto;margin-bottom:2.2rem;display:inline-block;">' +
          '<div style="font-size:0.72rem;letter-spacing:0.25em;text-transform:uppercase;color:var(--gold-dark,#8B7355);font-weight:600;margin-bottom:0.8rem;">Private Atelier Maintenance</div>' +
          '<h1 style="font-family:Cinzel,serif;font-size:clamp(1.8rem,4vw,2.4rem);font-weight:700;letter-spacing:0.04em;color:#1A1A1A;margin-bottom:1.2rem;line-height:1.2;">Vault Audit in Progress</h1>' +
          '<p style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:1.35rem;color:#6E6E73;line-height:1.6;margin-bottom:2.2rem;">' +
            'Our loose gemstone catalog is undergoing private curation and inventory synchronization. Private salon viewings and confidential acquisitions proceed uninterrupted.' +
          '</p>' +
          '<div style="background:#FFFFFF;border:1px solid #E5E0D8;padding:1.4rem 2rem;margin-bottom:2rem;">' +
            '<div style="font-size:0.75rem;text-transform:uppercase;letter-spacing:0.12em;color:#86868B;margin-bottom:0.4rem;">Direct Atelier Concierge</div>' +
            '<a href="mailto:' + email + '" style="font-family:Cinzel,serif;font-size:1.1rem;font-weight:700;color:#1A1A1A;text-decoration:none;">' + email + '</a>' +
          '</div>' +
          '<div style="font-size:0.75rem;color:#86868B;">' +
            '<a href="?admin=preview" style="color:#86868B;text-decoration:underline;">Admin Bypass Preview</a>' +
          '</div>' +
        '</div>';
      document.body.appendChild(overlay);
    }
  } else {
    if (overlay) {
      overlay.remove();
    }
  }
}

// DYNAMIC BUSINESS EMAIL & WHATSAPP SYNCHRONIZATION
function syncStorefrontContact() {
  let email = localStorage.getItem('dewera_business_email') || 'deweragems@gmail.com';
  let wa = localStorage.getItem('dewera_whatsapp') || '+94770000000';

  function applyContact(curEmail, curWa) {
    // 1. Update all mailto: links
    document.querySelectorAll('a[href^="mailto:"]').forEach(a => {
      const href = a.getAttribute('href');
      const parts = href.split('?');
      const query = parts[1] ? '?' + parts[1] : '';
      a.setAttribute('href', 'mailto:' + curEmail + query);
      if (a.textContent.includes('@')) {
        a.textContent = curEmail;
      }
    });

    // 2. Update all elements explicitly marked or containing the email
    document.querySelectorAll('.dynamic-email, [data-dynamic-email]').forEach(el => {
      el.textContent = curEmail;
    });

    // Update select option for email if present
    document.querySelectorAll('option[value="email"]').forEach(opt => {
      opt.textContent = 'Direct Email (' + curEmail + ')';
    });

    // 3. Update all WhatsApp links
    const cleanWa = curWa.replace(/[^0-9]/g, '');
    document.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
      const href = a.getAttribute('href');
      const textMatch = href.match(/text=([^&]*)/);
      const textParam = textMatch ? '?text=' + textMatch[1] : '';
      a.setAttribute('href', 'https://wa.me/' + cleanWa + textParam);
    });
    document.querySelectorAll('.dynamic-whatsapp, [data-dynamic-whatsapp]').forEach(el => {
      el.textContent = curWa;
    });
  }

  // Immediate apply from local cache
  applyContact(email, wa);

  // Fetch from server /api/config to ensure fresh sync across devices/browsers
  fetch('/api/config')
    .then(r => r.json())
    .then(cfg => {
      if (cfg && cfg.businessEmail) {
        localStorage.setItem('dewera_business_email', cfg.businessEmail);
        email = cfg.businessEmail;
      }
      if (cfg && cfg.whatsappNumber) {
        localStorage.setItem('dewera_whatsapp', cfg.whatsappNumber);
        wa = cfg.whatsappNumber;
      }
      applyContact(email, wa);
    })
    .catch(() => {});
}

// APPLE-GRADE FULL-PAGE BACKDROP BLUR SCRIM (media_1789989440762.png)
function initAppleBackdropBlur() {
  let scrim = document.getElementById('navBackdropScrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.className = 'nav-backdrop-scrim';
    scrim.id = 'navBackdropScrim';
    document.body.appendChild(scrim);
  }

  const navVaultItem = document.querySelector('.nav-vault-item');
  const navVaultFlyout = document.querySelector('.nav-vault-flyout');

  function openFlyout() {
    document.body.classList.add('nav-flyout-active');
  }

  function closeFlyout() {
    document.body.classList.remove('nav-flyout-active');
  }

  if (navVaultItem) {
    navVaultItem.addEventListener('mouseenter', openFlyout);
    navVaultItem.addEventListener('mouseleave', closeFlyout);
  }

  if (navVaultFlyout) {
    navVaultFlyout.addEventListener('mouseenter', openFlyout);
    navVaultFlyout.addEventListener('mouseleave', closeFlyout);
  }

  scrim.addEventListener('click', closeFlyout);
  scrim.addEventListener('mouseenter', closeFlyout);
}
function updateMarketplaceNavLinks(enabled) {
  document.querySelectorAll('a[href*="vault=marketplace"]').forEach(el => {
    if (enabled) {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

function updateSellerLinks(enabled) {
  document.querySelectorAll('.seller-hub-link').forEach(el => {
    if (enabled) {
      if (el.tagName === 'A' && el.classList.contains('apple-nav-link')) {
        el.style.display = 'inline-flex';
      } else {
        el.style.display = 'inline-block';
      }
    } else {
      el.style.display = 'none';
    }
  });
}

// REAL-TIME PLATFORM SETTINGS SYNCHRONIZER (Direct Admin Bridge)
async function syncPlatformSettings() {
  try {
    const res = await fetch('/api/settings?_t=' + Date.now());
    if (!res.ok) return;
    const settings = await res.json();
    if (!settings) return;

    const prevMkt = localStorage.getItem('dewera_marketplace_enabled');
    const newMkt = String(settings.marketplaceEnabled !== false);
    const prevMaint = localStorage.getItem('dewera_maintenance_mode');
    const newMaint = String(settings.maintenanceMode === true);

    localStorage.setItem('dewera_settings', JSON.stringify(settings));
    localStorage.setItem('dewera_marketplace_enabled', newMkt);
    localStorage.setItem('dewera_maintenance_mode', newMaint);
    localStorage.setItem('dewera_seller_registration_enabled', String(settings.sellerRegistrationEnabled !== false));

    if (settings.deweraEmail) localStorage.setItem('dewera_business_email', settings.deweraEmail);
    if (settings.deweraWhatsApp) localStorage.setItem('dewera_whatsapp', settings.deweraWhatsApp);

    applyMaintenanceOverlay(settings.maintenanceMode === true, settings);
    updateSellerLinks(settings.sellerRegistrationEnabled !== false && settings.marketplaceEnabled !== false);
    updateMarketplaceNavLinks(settings.marketplaceEnabled !== false);

    if (prevMkt !== newMkt || prevMaint !== newMaint) {
      fetchStoreGems();
      window.dispatchEvent(new CustomEvent('dewera:settings_updated', { detail: settings }));
    }
  } catch (e) {}
}

function initSellerLinkVisibility() {
  const cached = localStorage.getItem('dewera_seller_registration_enabled');
  const mktCached = localStorage.getItem('dewera_marketplace_enabled');
  if (cached !== null) {
    updateSellerLinks(cached === 'true' && mktCached !== 'false');
  }
  updateMarketplaceNavLinks(mktCached !== 'false');
  syncPlatformSettings();
}

// Initial sync and real-time polling every 3.5 seconds
syncPlatformSettings();
setInterval(syncPlatformSettings, 3500);

document.addEventListener('DOMContentLoaded', () => {
  checkMaintenanceMode();
  syncStorefrontContact();
  initAppleBackdropBlur();
  initSellerLinkVisibility();
  syncPlatformSettings();
  fetchStoreGems();
});
