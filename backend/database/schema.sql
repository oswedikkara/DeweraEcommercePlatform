-- Dewera Enterprise Gemstone Marketplace
-- Relational Database Schema (SQLite)
-- Zero emoji constraint strictly adhered to.

PRAGMA foreign_keys = ON;

-- 1. Staff Users
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator')),
    name TEXT NOT NULL,
    salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_by TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seller Profiles
CREATE TABLE IF NOT EXISTS seller_profiles (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    atelier_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    whatsapp TEXT,
    logo_path TEXT,
    legal_business_name TEXT,
    country TEXT DEFAULT 'Sri Lanka',
    address TEXT,
    status TEXT NOT NULL DEFAULT 'pending_verification',
    specialization TEXT,
    rating REAL DEFAULT 5.0,
    reviews_count INTEGER DEFAULT 0,
    positive_feedback_pct INTEGER DEFAULT 100,
    two_factor_secret TEXT,
    two_factor_verified INTEGER DEFAULT 0,
    sanction_status TEXT DEFAULT 'none',
    sanction_reason TEXT,
    sanction_evidence TEXT,
    sanction_actioned_by TEXT,
    sanction_actioned_at DATETIME,
    appeal_status TEXT DEFAULT 'none',
    appeal_statement TEXT,
    appeal_doc TEXT,
    appeal_submitted_at DATETIME,
    appeal_moderator_recommended INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seller Subscriptions
CREATE TABLE IF NOT EXISTS seller_subscriptions (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    plan TEXT NOT NULL,
    amount_usd REAL NOT NULL DEFAULT 40.0,
    billing_interval TEXT DEFAULT 'monthly',
    status TEXT NOT NULL DEFAULT 'unpaid',
    method TEXT,
    tx_hash TEXT,
    card_brand TEXT,
    card_last4 TEXT,
    receipt_url TEXT,
    wallet_type TEXT,
    valid_until DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES seller_profiles(id) ON DELETE CASCADE
);

-- 4. Gemstone Listings
CREATE TABLE IF NOT EXISTS gemstone_listings (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL, -- 'dewera' or seller_profiles.id
    is_dewera INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    species TEXT,
    variety TEXT,
    treatment TEXT NOT NULL CHECK (treatment IN ('Heated', 'Unheated')),
    origin TEXT NOT NULL,
    weight_carats REAL NOT NULL,
    clarity TEXT NOT NULL,
    color TEXT NOT NULL,
    cut TEXT,
    shape TEXT,
    dimensions TEXT,
    price REAL NOT NULL,
    price_max REAL,
    price_type TEXT DEFAULT 'exact',
    discount_pct REAL DEFAULT 0,
    sale_price REAL,
    status TEXT NOT NULL DEFAULT 'available',
    description TEXT,
    certificate_summary TEXT,
    gradient_from TEXT,
    gradient_to TEXT,
    images_json TEXT, -- JSON array of image URLs
    highlights_json TEXT, -- JSON array of highlights
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Gemstone Variations (Color / Cut Variations)
CREATE TABLE IF NOT EXISTS gemstone_variations (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    color_name TEXT NOT NULL,
    color_code TEXT,
    description TEXT,
    carat_weight REAL,
    price REAL,
    price_max REAL,
    status TEXT DEFAULT 'available',
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (listing_id) REFERENCES gemstone_listings(id) ON DELETE CASCADE
);

-- 6. Gemstone Certificates
CREATE TABLE IF NOT EXISTS gemstone_certificates (
    id TEXT PRIMARY KEY,
    listing_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    laboratory_name TEXT NOT NULL,
    certificate_number TEXT NOT NULL,
    certificate_date TEXT,
    certificate_type TEXT,
    document_path TEXT,
    verification_url TEXT,
    status TEXT DEFAULT 'verified',
    verified_by TEXT,
    verified_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES gemstone_listings(id) ON DELETE CASCADE
);

-- 7. Customer Inquiries
CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY, -- Format: DWR-INQ-YYYY-XXXXXX
    listing_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    variation_id TEXT,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    preferred_contact TEXT DEFAULT 'whatsapp',
    message TEXT,
    status TEXT DEFAULT 'new',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES gemstone_listings(id) ON DELETE CASCADE
);

-- 8. Verified Purchase References (Single-Use Review Tokens)
CREATE TABLE IF NOT EXISTS purchase_references (
    id TEXT PRIMARY KEY, -- Format: DWR-PUR-YYYY-XXXXXX
    inquiry_id TEXT,
    listing_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    variation_id TEXT,
    customer_email TEXT NOT NULL,
    amount_usd REAL NOT NULL,
    security_token TEXT UNIQUE NOT NULL,
    review_submitted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES gemstone_listings(id) ON DELETE CASCADE
);

-- 9. Customer Reviews
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    purchase_ref_id TEXT UNIQUE NOT NULL,
    listing_id TEXT NOT NULL,
    seller_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT NOT NULL,
    photo_path TEXT,
    is_verified_purchase INTEGER DEFAULT 1,
    status TEXT DEFAULT 'published',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (purchase_ref_id) REFERENCES purchase_references(id) ON DELETE CASCADE,
    FOREIGN KEY (listing_id) REFERENCES gemstone_listings(id) ON DELETE CASCADE
);

-- 10. Moderation Incident Reports
CREATE TABLE IF NOT EXISTS moderation_reports (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    reported_by TEXT NOT NULL,
    moderator_id TEXT,
    violation_category TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence_proof TEXT,
    status TEXT DEFAULT 'pending_admin_review',
    admin_notes TEXT,
    actioned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES seller_profiles(id) ON DELETE CASCADE
);

-- 11. Ban Requests (Moderator to Admin)
CREATE TABLE IF NOT EXISTS ban_requests (
    id TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    moderator_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    evidence TEXT,
    status TEXT DEFAULT 'pending',
    actioned_by TEXT,
    actioned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seller_id) REFERENCES seller_profiles(id) ON DELETE CASCADE
);

-- 12. Platform Settings
CREATE TABLE IF NOT EXISTS platform_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_by TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 13. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    old_value_json TEXT,
    new_value_json TEXT,
    ip_address TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 14. Anti-Fraud Blacklist (IP, Phone, Email, Atelier Name)
CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    value TEXT NOT NULL,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 15. Staff Sessions (Persistent Authentication Across Server Restarts)
CREATE TABLE IF NOT EXISTS staff_sessions (
    token TEXT PRIMARY KEY,
    staff_id TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT NOT NULL,
    name TEXT,
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 16. Seller Sessions (Persistent Multi-Tenant Authentication Across Server Restarts)
CREATE TABLE IF NOT EXISTS seller_sessions (
    token TEXT PRIMARY KEY,
    seller_id TEXT NOT NULL,
    email TEXT NOT NULL,
    atelier_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'seller',
    expires_at INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for high performance
CREATE INDEX IF NOT EXISTS idx_listings_seller ON gemstone_listings(seller_id);
CREATE INDEX IF NOT EXISTS idx_listings_is_dewera ON gemstone_listings(is_dewera);
CREATE INDEX IF NOT EXISTS idx_listings_status ON gemstone_listings(status);
CREATE INDEX IF NOT EXISTS idx_variations_listing ON gemstone_variations(listing_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_listing ON inquiries(listing_id);
CREATE INDEX IF NOT EXISTS idx_inquiries_seller ON inquiries(seller_id);
CREATE INDEX IF NOT EXISTS idx_purchases_security_token ON purchase_references(security_token);
CREATE INDEX IF NOT EXISTS idx_reviews_seller ON reviews(seller_id);
CREATE INDEX IF NOT EXISTS idx_reviews_listing ON reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_token ON staff_sessions(token);
CREATE INDEX IF NOT EXISTS idx_staff_sessions_expires ON staff_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_seller_sessions_token ON seller_sessions(token);
CREATE INDEX IF NOT EXISTS idx_seller_sessions_expires ON seller_sessions(expires_at);
