/**
 * Dewera Enterprise Gemstone Marketplace
 * IDOR Middleware - Object-Level Authorization Protection
 * Zero emoji constraint strictly adhered to.
 */

const { getDb } = require('../database/db');

function checkListingOwnership(listingId, actor) {
  if (!actor) return false;
  if (actor.role === 'super_admin') return true;

  const db = getDb();
  const listing = db.prepare('SELECT seller_id, is_dewera FROM gemstone_listings WHERE id = ?').get(listingId);
  if (!listing) return false;

  // Non-super admins cannot touch Dewera sovereign listings
  if (listing.is_dewera === 1) {
    return false;
  }

  // Admins can manage marketplace listings
  if (actor.role === 'admin') return true;

  // Sellers can only manage their own listings
  if (actor.role === 'seller' || actor.sellerId) {
    const actorSellerId = actor.sellerId || actor.id;
    return listing.seller_id === actorSellerId;
  }

  return false;
}

module.exports = {
  checkListingOwnership
};
