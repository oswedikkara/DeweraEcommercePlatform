function getStaffToken() {
  return sessionStorage.getItem('dewera_staff_token');
}

function getStaffRole() {
  return sessionStorage.getItem('dewera_staff_role') || 'moderator';
}

function getStaffUser() {
  return {
    username: sessionStorage.getItem('dewera_staff_username') || 'staff',
    role: sessionStorage.getItem('dewera_staff_role') || 'moderator',
    name: sessionStorage.getItem('dewera_staff_name') || 'Staff Member'
  };
}

function checkAuth() {
  if (!getStaffToken()) {
    window.location.href = 'index.html';
    return;
  }
  staffFetch('/api/auth/session').then(response=>{
    if(response.status===401){
      ['token','role','username','name','isOwner'].forEach(key=>sessionStorage.removeItem('dewera_staff_'+key));
      window.location.href='index.html';
    }
  }).catch(()=>{});
}

async function logout() {
  try { await staffFetch('/api/auth/logout', {method:'POST', signal:AbortSignal.timeout(5000)}); } catch {}
  _cachedGems = null;
  sessionStorage.removeItem('dewera_staff_token');
  sessionStorage.removeItem('dewera_staff_role');
  sessionStorage.removeItem('dewera_staff_username');
  sessionStorage.removeItem('dewera_staff_name');
  sessionStorage.removeItem('dewera_admin_authenticated');
  window.location.href = 'index.html';
}

async function staffFetch(url, options = {}) {
  const headers = options.headers || {};
  const token = getStaffToken();
  if (token) {
    headers['Authorization'] = 'Bearer ' + token;
    headers['x-staff-token'] = token;
  }
  return fetch(url, { ...options, headers });
}

const SEED_GEMS = [];

let _cachedGems = null;

function getGems() {
  const role = getStaffRole();
  let rawGems = [];
  if (_cachedGems && _cachedGems.length > 0) {
    rawGems = _cachedGems;
  } else {
    try {
      const data = localStorage.getItem('dewera_gems');
      if (data) {
        rawGems = JSON.parse(data);
        _cachedGems = rawGems;
      }
    } catch (e) {}
    if (!rawGems) {
      rawGems = [];
      _cachedGems = rawGems;
    }
  }

  // Strict Sovereign Confidentiality: Only Super Admin (Head Admin) has clearance to view Dewera sovereign listings!
  if (role !== 'super_admin') {
    return rawGems.filter(g => g.sellerId && g.sellerId !== 'dewera' && !g.isDewera);
  }
  return rawGems;
}

// Background sync from server /api/gems with Staff Authentication
async function syncGemsFromServer(onSyncComplete) {
  try {
    const res = await staffFetch('/api/gems');
    if (res.ok) {
      const serverGems = await res.json();
      if (Array.isArray(serverGems)) {
        const role = getStaffRole();
        if (role === 'super_admin') {
          _cachedGems = serverGems;
          localStorage.setItem('dewera_gems', JSON.stringify(serverGems));
        } else {
          // Strictly ensure no Dewera gems enter non-super-admin memory
          const marketplaceGems = serverGems.filter(g => g.sellerId && g.sellerId !== 'dewera' && !g.isDewera);
          _cachedGems = marketplaceGems;
          try {
            const existing = JSON.parse(localStorage.getItem('dewera_gems') || '[]');
            const sovereign = existing.filter(g => !g.sellerId || g.sellerId === 'dewera' || g.isDewera);
            localStorage.setItem('dewera_gems', JSON.stringify([...sovereign, ...marketplaceGems]));
          } catch(e) {
            localStorage.setItem('dewera_gems', JSON.stringify(marketplaceGems));
          }
        }
        if (typeof onSyncComplete === 'function') {
          onSyncComplete(getGems());
        }
        return getGems();
      }
    }
  } catch (e) {
    console.warn('Server gems sync offline, using local cache');
  }
  return getGems();
}

async function persistInventory(endpoint, payload) {
  const res = await staffFetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
  let result;
  try { result = await res.json(); } catch { throw new Error('The server returned an unreadable response. Please try again.'); }
  if (!res.ok || !result.success) throw new Error(result.error || 'Inventory could not be saved.');
  return result;
}
function rememberInventory(gems) {
  _cachedGems = gems;
  try { localStorage.setItem('dewera_gems', JSON.stringify(gems)); } catch {}
}
async function saveGems(gems) {
  const res = await staffFetch('/api/gems');
  if (!res.ok) throw new Error('Unable to verify the current inventory. Please sign in again.');
  const existing = await res.json();
  const ids = new Set(existing.map(g => g.id));
  let saved = 0;
  for (const gem of gems) {
    try { await persistInventory(ids.has(gem.id) ? '/api/gems/update' : '/api/gems', gem); saved++; }
    catch (error) { await syncGemsFromServer(); throw new Error(saved + ' of ' + gems.length + ' records saved. ' + error.message); }
  }
  await syncGemsFromServer();
}
async function addGem(gemData) {
  const result = await persistInventory('/api/gems', {...gemData, sellerId:'dewera', isDewera:true});
  rememberInventory([result.gem, ...getGems().filter(g => g.id !== result.gem.id)]);
  return result.gem;
}
async function updateGem(id, partial) {
  const result = await persistInventory('/api/gems/update', {id, ...partial});
  rememberInventory(getGems().map(g => g.id === id ? result.gem : g));
  return result.gem;
}
async function updateGemStatus(id, status) {
  const gem = await updateGem(id, {status});
  return gem.status;
}
async function deleteGem(id) {
  await persistInventory('/api/gems/delete', {id});
  rememberInventory(getGems().filter(g => g.id !== id));
}

async function toggleOutOfStock(id) {
  const gems = getGems();
  const gem = gems.find(g => g.id === id);
  if (gem) {
    const isOos = gem.status === 'out-of-stock' || gem.status === 'out_of_stock';
    const nextStatus = isOos ? 'available' : 'out-of-stock';
    await updateGemStatus(id, nextStatus);
    return nextStatus;
  }
  return null;
}

async function toggleSold(id) {
  const gems = getGems();
  const gem = gems.find(g => g.id === id);
  if (gem) {
    const nextStatus = gem.status === 'sold' ? 'available' : 'sold';
    await updateGemStatus(id, nextStatus);
    return nextStatus;
  }
  return null;
}

async function toggleHidden(id) {
  const gems = getGems();
  const gem = gems.find(g => g.id === id);
  if (gem) {
    const nextStatus = gem.status === 'hidden' ? 'available' : 'hidden';
    await updateGemStatus(id, nextStatus);
    return nextStatus;
  }
  return null;
}

async function applyDiscount(id, percent) {
  const gem = getGems().find(g => g.id === id);
  if (!gem) throw new Error('Gemstone not found. Refresh the inventory and try again.');
  const discount = !percent || Number(percent) <= 0 ? 0 : Math.min(90, Math.max(1, parseInt(percent, 10)));
  return updateGem(id, {discount, salePrice:discount ? Math.round(gem.price * (1 - discount / 100)) : null});
}

function showToast(msg) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0';
    t.style.transition = 'opacity 0.4s ease';
    setTimeout(() => t.remove(), 400);
  }, 2400);
}

// Automated Multi-Trillion-Dollar Gemstone Studio Cleaning Pipeline
// 1. Reads image into offscreen canvas
// 2. Samples perimeter background color and runs edge-flood background removal
// 3. Converts ambient shadow to delicate transparent ground contact shadow
// 4. Calculates tight bounding box of gemstone (auto-crop)
// 5. Standardizes and centers gemstone onto an 800x800 square canvas with luxury breathing margin
// 6. Synthesizes an Apple-standard soft elliptical ground contact shadow
// 7. Resolves to a clean transparent PNG Data URL
function processImageFile(file, maxWidth = 1000) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxWidth) {
            if (width >= height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxWidth) / height);
              height = maxWidth;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(img, 0, 0, width, height);

          const imgData = ctx.getImageData(0, 0, width, height);
          const data = imgData.data;

          // Sample perimeter background
          let sumR = 0, sumG = 0, sumB = 0, count = 0;
          for (let x = 0; x < width; x += 4) {
            const topIdx = x * 4;
            const btmIdx = ((height - 1) * width + x) * 4;
            sumR += data[topIdx] + data[btmIdx];
            sumG += data[topIdx + 1] + data[btmIdx + 1];
            sumB += data[topIdx + 2] + data[btmIdx + 2];
            count += 2;
          }
          for (let y = 0; y < height; y += 4) {
            const leftIdx = (y * width) * 4;
            const rightIdx = (y * width + (width - 1)) * 4;
            sumR += data[leftIdx] + data[rightIdx];
            sumG += data[leftIdx + 1] + data[rightIdx + 1];
            sumB += data[leftIdx + 2] + data[rightIdx + 2];
            count += 2;
          }
          const bgR = sumR / count;
          const bgG = sumG / count;
          const bgB = sumB / count;
          const bgLum = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

          // Perform flood-fill background isolation from borders if background is light/studio
          if (bgLum > 175) {
            const visited = new Uint8Array(width * height);
            const queue = [];

            function getPixelIdx(x, y) { return (y * width + x) * 4; }

            // Enqueue all outer boundary pixels
            for (let x = 0; x < width; x++) {
              queue.push(x, 0); queue.push(x, height - 1);
              visited[x] = 1; visited[(height - 1) * width + x] = 1;
            }
            for (let y = 1; y < height - 1; y++) {
              queue.push(0, y); queue.push(width - 1, y);
              visited[y * width] = 1; visited[y * width + width - 1] = 1;
            }

            let head = 0;
            while (head < queue.length) {
              const x = queue[head++];
              const y = queue[head++];
              const idx = getPixelIdx(x, y);

              const r = data[idx];
              const g = data[idx + 1];
              const b = data[idx + 2];

              const lum = 0.299 * r + 0.587 * g + 0.114 * b;
              const sat = Math.max(r, g, b) - Math.min(r, g, b);
              const colorDist = Math.hypot(r - bgR, g - bgG, b - bgB);

              let isBg = false;

              if (lum >= 242 || colorDist < 36) {
                isBg = true;
                data[idx + 3] = 0; // Pure transparent
              } else if (lum > 165 && sat < 35) {
                // Ground contact shadow feathering
                isBg = true;
                const darkness = (242 - lum) / (242 - 165);
                const alpha = Math.round(Math.pow(darkness, 1.6) * 150);
                data[idx] = 25;
                data[idx + 1] = 20;
                data[idx + 2] = 18;
                data[idx + 3] = Math.min(255, Math.max(0, alpha));
              }

              if (isBg) {
                const neighbors = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
                for (const [nx, ny] of neighbors) {
                  if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nPos = ny * width + nx;
                    if (!visited[nPos]) {
                      visited[nPos] = 1;
                      const nidx = getPixelIdx(nx, ny);
                      const nr = data[nidx];
                      const ng = data[nidx + 1];
                      const nb = data[nidx + 2];
                      const nlum = 0.299 * nr + 0.587 * ng + 0.114 * nb;
                      const nsat = Math.max(nr, ng, nb) - Math.min(nr, ng, nb);
                      const ndist = Math.hypot(nr - bgR, ng - bgG, nb - bgB);
                      if (nlum >= 236 || ndist < 46 || (nlum > 160 && nsat < 40)) {
                        queue.push(nx, ny);
                      }
                    }
                  }
                }
              }
            }
            ctx.putImageData(imgData, 0, 0);
          }

          // Calculate tight bounding box of the non-transparent gemstone
          const processedData = ctx.getImageData(0, 0, width, height).data;
          let minX = width, maxX = 0, minY = height, maxY = 0;
          let hasGemstone = false;

          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
              const a = processedData[(y * width + x) * 4 + 3];
              if (a > 30) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
                hasGemstone = true;
              }
            }
          }

          if (!hasGemstone || (maxX - minX) < 15 || (maxY - minY) < 15) {
            // Fallback to original
            resolve(canvas.toDataURL('image/png'));
            return;
          }

          // Standardize and center on an 800x800 square studio canvas
          const squareCanvas = document.createElement('canvas');
          squareCanvas.width = 800;
          squareCanvas.height = 800;
          const sCtx = squareCanvas.getContext('2d');

          const gw = maxX - minX + 1;
          const gh = maxY - minY + 1;
          const targetSize = 620; // 77.5% fill for extreme luxury whitespace
          const scale = Math.min(targetSize / gw, targetSize / gh);
          const sw = Math.round(gw * scale);
          const sh = Math.round(gh * scale);
          const dx = Math.round((800 - sw) / 2);
          const dy = Math.round((800 - sh) / 2 - 12); // subtle vertical lift

          // Synthesize luxury Apple ground contact shadow
          const shadowGrad = sCtx.createRadialGradient(400, dy + sh + 4, sw * 0.05, 400, dy + sh + 4, sw * 0.42);
          shadowGrad.addColorStop(0, 'rgba(25, 20, 16, 0.20)');
          shadowGrad.addColorStop(0.4, 'rgba(25, 20, 16, 0.08)');
          shadowGrad.addColorStop(1, 'rgba(25, 20, 16, 0)');

          sCtx.save();
          sCtx.scale(1, 0.22);
          sCtx.beginPath();
          sCtx.arc(400, (dy + sh + 4) / 0.22, sw * 0.42, 0, Math.PI * 2);
          sCtx.fillStyle = shadowGrad;
          sCtx.fill();
          sCtx.restore();

          // Render centered, cleaned gemstone
          sCtx.drawImage(canvas, minX, minY, gw, gh, dx, dy, sw, sh);

          resolve(squareCanvas.toDataURL('image/png'));
        } catch (err) {
          console.error('Image processing error:', err);
          // Fallback to standard
          resolve(canvas.toDataURL('image/png'));
        }
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function exportJSON() {
  const data = JSON.stringify(getGems(), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'dewera_gems.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Gem archive exported as JSON.');
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (Array.isArray(parsed)) {
        await saveGems(parsed);
        showToast('Imported ' + parsed.length + ' gemstones.');
        setTimeout(() => location.reload(), 600);
      } else {
        alert('Invalid JSON: Expected an array of gemstones.');
      }
    } catch (err) {
      alert(err.message || 'Unable to import the inventory file.');
    }
  };
  reader.readAsText(file);
}
