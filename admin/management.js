'use strict';
checkAuth();
(() => {
  const q = selector => document.querySelector(selector);
  const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => new Intl.NumberFormat('en-US', {style:'currency', currency:'USD', maximumFractionDigits:0}).format(Number(value) || 0);
  const isEnquiries = new URLSearchParams(location.search).get('view') === 'enquiries';
  const headAdmin = getStaffRole() === 'super_admin';
  let enquiries = [];
  let inventoryCache = [];
  let enquiryLoaded = false;
  let timer;
  const user = getStaffUser();
  q('#staffName').textContent = user.name || user.username;
  q('#staffInitial').textContent = (user.name || user.username || 'D').slice(0,1).toUpperCase();
  q('#staffRole').textContent = ({super_admin:'Head administrator', admin:'Administrator', moderator:'Moderator'})[user.role] || 'Staff member';
  q('#signOut').addEventListener('click', logout);
  document.querySelector(`[data-nav="${isEnquiries?'enquiries':'overview'}"]`).setAttribute('aria-current','page');
  if (isEnquiries) {
    q('#viewName').textContent = 'Client enquiries';
    q('#workspaceTitle').textContent = 'Every conversation matters.';
    q('#workspaceDescription').textContent = 'Consultation requests, private viewings, and personal searches. Review and follow up with each client.';
    q('#metrics').hidden = true;
    q('#overviewColumns').hidden = true;
    document.title = 'Client enquiries — Dewera Management';
  }
  if (!headAdmin) {
    q('#addGemAction').hidden = true;
    q('#metrics').hidden = true;
    document.querySelectorAll('a[href="new.html"]').forEach(a => a.hidden = true);
  }
  function notice(message, error = false) {
    const el = q('#consoleNotice');
    el.textContent = message;
    el.hidden = !message;
    el.classList.toggle('error', error);
  }
  function toast(message) {
    q('#consoleToast').textContent = message;
    q('#consoleToast').classList.add('visible');
    clearTimeout(timer);
    timer = setTimeout(() => q('#consoleToast').classList.remove('visible'), 3000);
  }
  async function getJSON(path) {
    const res = await staffFetch(path);
    if (res.status === 401) { logout(); throw Error('Your session has expired. Please sign in again.'); }
    let data;
    try { data = await res.json(); } catch { throw Error('The server returned an unreadable response.'); }
    if (!res.ok) throw Error(data.error || 'Unable to load the workspace.');
    return data;
  }
  function showInventory(gems) {
    const own = gems.filter(g => g.isDewera || !g.sellerId || g.sellerId === 'dewera');
    const available = own.filter(g => g.status === 'available');
    const open = enquiries.filter(e => !['closed','resolved'].includes(e.status));
    const cards = [
      ['Total gemstones', own.length, 'In the Dewera inventory', '&#9671;'],
      ['Available stones', available.length, 'Visible in the storefront', '&#9675;'],
      ['Open client enquiries', enquiryLoaded ? open.length : '—', 'New and ongoing conversations', '&#9993;'],
      ['Available inventory value', money(available.reduce((sum,g) => sum + Number(g.salePrice || g.price || 0), 0)), 'Listed asking prices · USD', '&#8599;']
    ];
    q('#metrics').innerHTML = cards.map(([label,value,note,symbol]) => `<article class="metric"><div class="metric-label">${esc(label)}<span aria-hidden="true">${symbol}</span></div><strong>${esc(value)}</strong><p>${esc(note)}</p></article>`).join('');
    if (!headAdmin) {
      q('#inventoryPreview').innerHTML = '<p class="empty-message">Dewera inventory and client enquiries are restricted to the head administrator under the existing access policy.</p>';
      return;
    }
    q('#inventoryPreview').innerHTML = own.length ? own.slice(0,4).map(g => {
      const source = String(g.images?.[0] || '');
      // Relative storefront images are also available on the admin server.
      const safeImage = source && !/^(?:javascript:|data:text|vbscript:)/i.test(source) ? source : '';
      return `<article class="inventory-row">${safeImage?`<img src="${esc(safeImage)}" alt="${esc(g.name)}">`:''}<div><h3>${esc(g.name)}</h3><p>${esc(g.weight)} ct · ${esc(g.type)} · ${esc(g.id)}</p><span class="state-badge ${g.status==='sold'?'sold':''}">${esc(g.status)}</span></div><span class="inventory-price">${money(g.salePrice || g.price)}</span></article>`;
    }).join('') : '<p class="empty-message">Your collection is ready for its first gemstone.<br><a class="console-link" href="new.html">Add a gemstone →</a></p>';
  }
  function formatDate(value) {
    const date = new Date(String(value).replace(' ','T') + (/Z$|[+-]\d{2}:\d{2}$/.test(String(value))?'':'Z'));
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Colombo', dateStyle:'medium'}).format(date);
  }
  function renderEnquiries() {
    const list = q('#enquiryList');
    if (!headAdmin) { list.innerHTML = '<p class="empty-message">Customer enquiries require head administrator access.</p>'; return; }
    if (!enquiryLoaded) { list.innerHTML = '<p class="empty-message">Client enquiries could not be loaded. Use Refresh to try again.</p>'; return; }
    const term = q('#enquirySearch').value.trim().toLowerCase();
    const filter = q('#enquiryFilter').value;
    const rows = enquiries.filter(row => (filter === 'all' || row.status === filter) && [row.id,row.customer_name,row.customer_email,row.listing_name,row.message].join(' ').toLowerCase().includes(term));
    q('#enquiryTotal').textContent = `${rows.length} of ${enquiries.length} recent requests`;
    q('#navEnquiries').textContent = enquiries.filter(row => row.status === 'new').length || '';
    list.innerHTML = rows.length ? rows.map(row => `<article class="enquiry-card"><div class="enquiry-card-header"><div><h3>${esc(row.customer_name)} <span aria-hidden="true">/</span> ${esc(row.listing_name || 'Personal consultation')}</h3><span class="enquiry-reference">${esc(row.id)} · ${esc(formatDate(row.created_at))}</span></div><span class="state-badge ${['new','closed'].includes(row.status)?row.status:''}">${esc(row.status)}</span></div><div class="enquiry-meta"><span>${esc(row.customer_email)}</span>${row.customer_phone?`<span>${esc(row.customer_phone)}</span>`:''}<span>Preferred reply: ${esc(row.preferred_contact || 'email')}</span></div><p class="enquiry-message">${esc(row.message || 'No message provided.')}</p><div class="enquiry-actions"><a class="console-link" href="mailto:${encodeURIComponent(row.customer_email)}?subject=${encodeURIComponent('Dewera consultation · '+row.id)}">Reply by email ↗</a><label>Status<select data-status="${esc(row.id)}" aria-label="Status for ${esc(row.id)}">${[...new Set([row.status,'new','contacted','closed'])].map(status=>`<option value="${esc(status)}" ${status===row.status?'selected':''}>${esc(status)}</option>`).join('')}</select></label><button type="button" class="console-button secondary compact" data-save-enquiry="${esc(row.id)}">Save status</button></div></article>`).join('') : '<p class="empty-message">'+(enquiries.length?'No enquiries match these filters.':'No customer requests yet. New consultations will appear here.')+'</p>';
  }
  q('#enquirySearch').addEventListener('input', renderEnquiries);
  q('#enquiryFilter').addEventListener('change', renderEnquiries);
  q('#enquiryList').addEventListener('click', async event => {
    const button = event.target.closest('[data-save-enquiry]');
    if (!button) return;
    const id = button.dataset.saveEnquiry;
    const row = enquiries.find(row => row.id === id);
    const select = [...document.querySelectorAll('[data-status]')].find(select => select.dataset.status === id);
    if (!row || !select) return;
    if (select.value === row.status) { toast('This status is already saved.'); return; }
    const status = select.value;
    button.disabled = true; select.disabled = true; button.textContent = 'Saving…';
    try {
      const res = await staffFetch('/api/inquiries/'+encodeURIComponent(id)+'/status', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({status})});
      const result = await res.json();
      if (!res.ok || !result.success) throw Error(result.error || 'Could not save this status.');
      row.status = status;
      notice('');
      showInventory(inventoryCache);
      renderEnquiries();
      toast('Enquiry status saved.');
    } catch (error) {
      notice(error.message, true); select.value = row.status;
      button.disabled = false; select.disabled = false; button.textContent = 'Save status';
    }
  });
  let loading = false;
  async function load() {
    if (loading) return;
    loading = true;
    q('#refreshData').disabled = true; q('#refreshData').textContent = 'Refreshing…'; notice('');
    const paths = headAdmin ? ['/api/gems','/api/inquiries','/api/settings'] : ['/api/gems','/api/settings'];
    const results = await Promise.allSettled(paths.map(getJSON));
    let inventory = [];
    let inventoryLoaded = false;
    const errors = [];
    results.forEach((result,index) => {
      if (result.status === 'rejected') { errors.push(result.reason.message); return; }
      const path = paths[index]; const data = result.value;
      if (path === '/api/gems') {
        if (Array.isArray(data)) { inventory = data; inventoryLoaded = true; }
        else errors.push('The inventory response was invalid.');
      }
      if (path === '/api/inquiries') {
        if (Array.isArray(data)) { enquiries = data; enquiryLoaded = true; }
        else errors.push('The enquiry response was invalid.');
      }
      if (path === '/api/settings') {
        q('#storeStatus').textContent = data.maintenanceMode ? 'Store in maintenance' : 'Store online';
        q('#storeStatus').className = 'store-status '+(data.maintenanceMode?'maintenance':'online');
      }
    });
    if (errors.length) notice([...new Set(errors)].join(' '), true);
    inventoryCache = inventory;
    showInventory(inventory); renderEnquiries();
    if (!inventoryLoaded && headAdmin) {
      q('#inventoryPreview').innerHTML = '<p class="empty-message">Inventory could not be loaded. Use Refresh to try again.</p>';
      q('#metrics').querySelectorAll('.metric strong').forEach(el => el.textContent = '—');
    }
    q('#refreshData').disabled = false; q('#refreshData').textContent = 'Refresh'; loading = false;
  }
  q('#refreshData').addEventListener('click', load);
  load();
})();
