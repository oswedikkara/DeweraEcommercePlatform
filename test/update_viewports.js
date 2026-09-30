const fs = require('fs');
const files = [
  './store/index.html',
  './store/collection.html',
  './store/gem.html',
  './store/contact.html',
  './store/about.html',
  './store/seller.html',
  './admin/index.html',
  './admin/dashboard.html',
  './admin/gems.html',
  './admin/new.html',
  './admin/seller-portal.html'
];

files.forEach(f => {
  let c = fs.readFileSync(f, 'utf8');
  if (c.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0">')) {
    c = c.replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">'
    );
    fs.writeFileSync(f, c, 'utf8');
    console.log('Updated viewport in ', f);
  } else {
    console.log('No update needed for ', f);
  }
});
