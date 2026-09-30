# Dewera — Haute Gemmologie Ceylon Natural Heated

> Sovereign Ceylon Gemstone Vault & Multi-Vendor Atelier Marketplace

---

## 1. Architectural Overview

Dewera is an enterprise-grade luxury e-commerce and multi-vendor atelier marketplace dedicated to certified natural heated Sri Lankan (Ceylon) gemstones.

- **Public Storefront** (`store/`, Port `3000`): Apple-standard luxury presentation featuring editorial Bento showcases, specimen dossiers, dynamic color variation selection, and secure concierge inquiry routing.
- **Governance & Admin Panel** (`admin/`, Port `3001`): Operations console governing platform operational states (Maintenance Mode, External Seller Marketplace Visibility), merchant sanctions, escrow audits, and inventory management.
- **Relational Backend Engine** (`backend/`): Native `node:sqlite` database with Write-Ahead Logging (`WAL`), strict foreign keys, and complete data synchronization across JSON backups.

---

## 2. Directory Structure

```text
dewera/
|-- .editorconfig             # Standard code formatting across editors
|-- .gitignore                # Production ignore rules for Node, SQLite, and OS artifacts
|-- package.json              # Industrial package manifest and execution scripts
|-- README.md                 # System architecture and deployment manual
|-- backend/
|   |-- api/
|   |   \-- router.js         # Unified HTTP API router with RBAC and input validation
|   |-- database/
|   |   |-- db.js             # SQLite DatabaseSync connection, WAL and sync
|   |   \-- schema.sql        # Relational schema
|   |-- middleware/
|   \-- services/             # Domain services (Inquiry, Inventory, Config, etc.)
|-- data/
|   |-- dewera.db             # Primary SQLite database file
|   |-- gems.json             # Gem catalog JSON source
|   \-- site-config.json      # Platform configuration (maintenance, marketplace)
|-- store/                    # Public storefront client application
|   |-- index.html            # Main salon and hero landing page
|   |-- collection.html       # Dynamic catalog and specimen gallery
|   |-- gem.html              # Specimen dossier and inquiry terminal
|   |-- contact.html          # Atelier concierge booking and communication
|   |-- about.html            # Atelier heritage and provenance
|   |-- seller.html           # Merchant application portal
|   |-- style.css             # Storefront design system and responsive suite
|   |-- client.js             # Storefront frontend state and interactions
|   \-- server.js             # Storefront static and API server (Port 3000)
|-- admin/                    # Platform administration and governance
|   |-- index.html            # Admin login
|   |-- dashboard.html        # Platform metrics and system toggles
|   |-- gems.html             # Gem inventory management
|   |-- new.html              # Specimen onboarding form
|   |-- seller-portal.html    # Seller sanctions and approvals
|   |-- style.css             # Admin dashboard stylesheet
|   \-- server.js             # Admin governance server (Port 3001)
\-- test/
    \-- device_audit.js       # Industrial standards and responsive layout test suite
```

---

## 3. Responsive Design & Device Standards

The application layout conforms to five responsive device tiers:

1. **Ultra-Compact & Mobile Phones (320px - 480px)**:
   - Apple notch safe-area adaptation via `viewport-fit=cover` and CSS env variables (`safe-area-inset-*`).
   - Single-column flow (`1fr`) with zero horizontal overflow.
   - iOS Safari auto-zoom prevention: all form inputs enforce `font-size: 16px !important`.
   - Minimum 44px tap targets for navigation, filters, and call-to-action buttons.
   - Compact 2x2 specification matrix for gem dossier parameters.

2. **Large Phones & Phablets (481px - 767px)**:
   - Fluid typography and proportional margin scaling.
   - Dual-column metric grids for concise data visibility.

3. **Tablets & Small Laptops (768px - 1024px)**:
   - 2-column catalog grid with responsive facet filtering.
   - Dossier presentation with side-by-side gallery and inquiry panel.

4. **Desktops & Standard Displays (1025px - 1440px)**:
   - 3-column curated specimen showcase.
   - Fixed atelier navigation with backdrop blur.

5. **Ultra-Wide & 4K Displays (1441px+)**:
   - Centered containers constrained to `max-width: 1440px`.
   - Balanced negative space reflecting high-end luxury editorial design.

---

## 4. Verification and Quality Assurance

Run the comprehensive industrial verification suite:

```bash
npm test
```

The test runner validates:
- Apple notch safe-area tags across all 11 HTML templates.
- CSS device optimization rules (safe-area insets, font zoom protection, touch targets, 4K constraints).
- Zero emoji policy compliance across all source code, assets, and documentation.
- Project manifest integrity and file structure conformance.