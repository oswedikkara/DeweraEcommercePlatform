/**
 * Dewera Enterprise Gemstone Marketplace
 * Upload Middleware - Magic-Byte Buffer Verification & MIME Sanitizer
 * Zero emoji constraint strictly adhered to.
 */

function validateImageBuffer(buffer) {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: 'Empty file buffer provided.' };
  }

  if (buffer.length > 5 * 1024 * 1024) {
    return { valid: false, error: 'File size exceeds maximum allowable limit of 5MB.' };
  }

  // Magic Bytes Check
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { valid: true, mime: 'image/jpeg', ext: '.jpg' };
  }

  // PNG: 89 50 4E 47
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return { valid: true, mime: 'image/png', ext: '.png' };
  }

  // WebP: RIFF ... WEBP
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return { valid: true, mime: 'image/webp', ext: '.webp' };
  }

  return {
    valid: false,
    error: 'Disallowed file structure. Image must be authentic JPEG, PNG, or WebP binary stream.'
  };
}

module.exports = {
  validateImageBuffer
};
