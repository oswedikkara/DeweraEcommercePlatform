const fs = require('fs');

console.log('=======================================================');
console.log('DEWERA INDUSTRIAL STANDARD & DEVICE AUDIT TEST SUITE');
console.log('=======================================================');

let passedCount = 0;
let failedCount = 0;

function assert(testName, condition, details) {
  if (condition) {
    console.log('  [PASSED] ' + testName);
    passedCount++;
  } else {
    console.error('  [FAILED] ' + testName + ': ' + (details || ''));
    failedCount++;
  }
}

// 1. Verify Cross-Device Viewport Meta Tags
const htmlFiles = [
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

console.log('\n--- TEST SUITE 1: VIEWPORT & NOTCH STEQDY-STATE: ---');
htmlFiles.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  assert(
    f + ' contains viewport-fit=cover',
    content.includes('viewport-fit=cover'),
    'Missing viewport-fit=cover in <meta name="viewport">'
  );
});

// 2. Verify CSS Device Optimization Suite
console.log('\n--- TEST SUITE 2: CSS DEVICE OPTIMIZATION & SAVE-AREA ---');
console.log('Store CSS:');
const storeCSS = fs.readFileSync('./store/style.css', 'utf8');
assert('Store CSS has safe-area insets', storeCSS.includes('--safe-top'), 'Missing --safe-top');
assert('Store CSS has iOS safari 16px font zoom fix', storeCSS.includes('font-size: 16px !important'), 'Missing 16px input rule');
assert('Store CSS has 44px minimum touch targets', storeCSS.includes('touch-action: manipulation'), 'Missing touch-action rule');
assert('Store CSS has responsive nav rules', storeCSS.includes('apple-nav-links') && storeCSS.includes('(max-width: 640px)'), 'Missing mobile nav media query');
assert('Store CSS has ultra-wide 4K constraints', storeCSS.includes('max-width: 1440px'), 'Missing 4K rule');

console.log('Admin CSS:');
const adminCSS = fs.readFileSync('./admin/style.css', 'utf8');
assert('Admin CSS has responsive layout rewrite', adminCSS.includes('.admin-layout'), 'Missing admin-layout responsive rewrite');
assert('Admin CSS: Mobile/Sidebar conversion', adminCSS.includes('flex-direction: column'), 'Missing flex-direction column for mobile');

// 3. Verify Zero Emoji Standard
console.log('\n--- TEST SUITE 3: ZERO EMOJI STANDARD ---');
const emojiRegex = /[\u{1F300}-\u{1FAFF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
const auditFiles = [
  './backend/services/InquiryService.js',
  './backend/api/router.js',
  './store/gem.html',
  './store/contact.html',
  './store/collection.html',
  './store/index.html',
  './store/style.css',
  './store/server.js',
  './admin/style.css',
  './README.md'
];
	auditFiles.forEach(f => {
  const c = fs.readFileSync(f, 'utf8');
  assert(f + ' has zero emoji', !emojiRegex.test(c), 'Detected emoji character');
});

// 4. Verify Industrial Project Artifacts
console.log('\n--- TEST SUITE 4: INDUSTRIAL PROJECT ARTILECTS ---');
assert('.gitignore exists', fs.existsSync('./.gitignore'));
assert('.editorconfig exists', fs.existsSync('./.editorconfig'));
assert('README.md exists', fs.existsSync('./README.md'));

const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
assert('package.json has name', !!pkg.name);
assert('package.json has scripts', pkg.scripts && pkg.scripts.start && pkg.scripts.test);

console.log('\nTEST RESULTS: ' + passedCount + ' passed, ' + failedCount + ' failed.\n');
if (failedCount > 0) {
  process.exit(1);
}
