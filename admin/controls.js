/* Shared, progressively enhanced select controls. Native form values stay authoritative. */
(() => {
  let sequence = 0;
  let active = null;
  function enhance(select) {
    if (select.dataset.refinedSelect || select.multiple || select.size > 1) return;
    select.dataset.refinedSelect = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'refined-select';
    select.before(wrapper);
    wrapper.append(select);
    select.classList.add('refined-select-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'refined-select-trigger';
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const id = 'refined-options-' + (++sequence);
    button.setAttribute('aria-controls', id);
    const label = select.labels?.[0];
    if (label && !label.contains(select)) {
      if (!label.id) label.id = id + '-label';
      button.setAttribute('aria-labelledby', label.id + ' ' + id + '-value');
      label.addEventListener('click', event => { if (!event.target.closest('.refined-select')) { event.preventDefault(); button.focus(); } });
    } else button.setAttribute('aria-label', select.getAttribute('aria-label') || (label ? [...label.childNodes].filter(node=>node.nodeType===3).map(node=>node.textContent).join(' ').trim() : '') || 'Choose an option');
    const value = document.createElement('span');
    value.id = id + '-value';
    const arrow = document.createElement('span');
    arrow.className = 'refined-select-chevron';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(value, arrow);
    const list = document.createElement('div');
    list.id = id;
    list.className = 'refined-select-options';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', label?.textContent.trim() || select.getAttribute('aria-label') || 'Options');
    list.hidden = true;
    const error = document.createElement('span');
    error.className = 'refined-select-error';
    error.textContent = 'Please choose an option.';
    error.setAttribute('role', 'status');
    error.hidden = true;
    wrapper.append(button, list, error);
    let index = select.selectedIndex;
    let search = '';
    let searchTimer;
    function enabled(i) { const option = select.options[i]; return option && !option.disabled && !option.hidden && !option.parentElement.disabled; }
    function sync() {
      const selectedText = select.options[select.selectedIndex]?.textContent || 'Choose an option';
      if (value.textContent !== selectedText) value.textContent = selectedText;
      button.disabled = select.disabled;
      button.setAttribute('aria-required', String(select.required));
      [...list.children].forEach((el, i) => el.setAttribute('aria-selected', String(i === select.selectedIndex)));
    }
    function build() {
      list.replaceChildren();
      [...select.options].forEach((option, i) => {
        const item = document.createElement('div');
        item.id = id + '-' + i;
        item.setAttribute('role', 'option');
        item.className = 'refined-select-option';
        item.textContent = option.textContent;
        item.hidden = option.hidden;
        item.setAttribute('aria-disabled', String(!enabled(i)));
        item.addEventListener('pointerdown', event => event.preventDefault());
        item.addEventListener('click', () => { if (enabled(i)) choose(i); });
        item.addEventListener('pointermove', () => { if (enabled(i)) highlight(i, false); });
        list.append(item);
      });
      sync();
    }
    function close() {
      list.hidden = true;
      button.setAttribute('aria-expanded', 'false');
      button.removeAttribute('aria-activedescendant');
      wrapper.classList.remove('is-open');
      if (active === close) active = null;
    }
    function highlight(i, scroll = true) {
      index = i;
      [...list.children].forEach((el, n) => el.classList.toggle('is-highlighted', n === index));
      button.setAttribute('aria-activedescendant', id + '-' + i);
      if (scroll) list.children[i]?.scrollIntoView({block:'nearest'});
    }
    function open() {
      if (button.disabled) return;
      if (active) active();
      active = close;
      sync();
      list.hidden = false;
      wrapper.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      const rect = button.getBoundingClientRect();
      wrapper.classList.toggle('opens-up', innerHeight - rect.bottom < Math.min(list.scrollHeight, 260) + 15 && rect.top > 280);
      highlight(select.selectedIndex >= 0 ? select.selectedIndex : 0);
    }
    function choose(i) {
      select.selectedIndex = i;
      sync();
      close();
      error.hidden = true;
      button.removeAttribute('aria-invalid');
      select.dispatchEvent(new Event('input', {bubbles:true}));
      select.dispatchEvent(new Event('change', {bubbles:true}));
      button.focus({preventScroll:true});
    }
    function move(direction) {
      for (let step = 1; step <= select.options.length; step++) {
        const next = Math.max(0, Math.min(select.options.length - 1, index + direction * step));
        if (enabled(next)) { highlight(next); break; }
      }
    }
    button.addEventListener('click', () => list.hidden ? open() : close());
    button.addEventListener('keydown', event => {
      const key = event.key;
      if (key === 'Tab') { close(); return; }
      if (key === 'Escape') { if (!list.hidden) { event.preventDefault(); event.stopPropagation(); close(); } return; }
      if (['ArrowDown','ArrowUp','Home','End','Enter',' '].includes(key)) {
        event.preventDefault();
        if (list.hidden) { open(); if (key === 'ArrowDown' || key === 'ArrowUp') return; }
        else if (key === 'Enter' || key === ' ') { if (enabled(index)) choose(index); return; }
        if (key === 'ArrowDown') move(1);
        if (key === 'ArrowUp') move(-1);
        if (key === 'Home') highlight([...select.options].findIndex((_,i) => enabled(i)));
        if (key === 'End') { for(let i=select.options.length-1;i>=0;i--) if(enabled(i)){highlight(i);break;} }
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        if (list.hidden) open();
        clearTimeout(searchTimer); search += key.toLowerCase();
        const found = [...select.options].findIndex((o,i) => enabled(i) && o.textContent.trim().toLowerCase().startsWith(search));
        if (found >= 0) highlight(found);
        searchTimer = setTimeout(() => search = '', 650);
      }
    });
    button.addEventListener('blur', close);
    select.addEventListener('change', sync);
    select.addEventListener('dewera:select-sync', sync);
    select.addEventListener('invalid', event => { event.preventDefault(); error.hidden = false; button.setAttribute('aria-invalid','true'); button.focus(); });
    select.form?.addEventListener('reset', () => setTimeout(sync, 0));
    new MutationObserver(build).observe(select, {childList:true,subtree:true,attributes:true,attributeFilter:['disabled','label','selected','hidden']});
    build();
  }
  function scan() { document.querySelectorAll('select:not([data-refined-select])').forEach(enhance); document.querySelectorAll('select[data-refined-select]').forEach(select => select.dispatchEvent(new Event('dewera:select-sync'))); }
  document.addEventListener('pointerdown', event => { if (active && !event.target.closest('.refined-select')) active(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
  new MutationObserver(scan).observe(document.documentElement, {childList:true,subtree:true,attributes:true,attributeFilter:['style','hidden']});
})();
