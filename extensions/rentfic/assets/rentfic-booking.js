(function () {
  'use strict';

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const WEEK_DAYS  = ['sun','mon','tue','wed','thu','fri','sat'];

  // ─── Boot ────────────────────────────────────────────────────────────────────
  function boot() {
    const embed = document.getElementById('rentfic-app-embed');
    if (!embed || embed.dataset.enabled === 'false') return;

    const match = window.location.pathname.match(/\/products\/([^/?#]+)/);
    if (!match) return;

    fetch('/products/' + match[1] + '.js')
      .then(function (r) { return r.json(); })
      .then(function (product) { injectWidget(embed, product.id); })
      .catch(function () {});
  }

  function injectWidget(embed, productId) {
    var container = document.createElement('div');
    container.id = 'rentfic-booking-widget';
    container.dataset.productId   = productId;
    container.dataset.currency    = embed.dataset.currency    || 'USD';
    container.dataset.moneyFormat = embed.dataset.moneyFormat || '{{amount}}';
    container.dataset.primaryColor = embed.dataset.primaryColor || '#008060';
    container.dataset.buttonText  = embed.dataset.buttonText  || 'Reserve Now';
    container.innerHTML = '<div class="rentfic-loading">Checking availability…</div>';

    var inserted = false;
    var beforeFormSelectors = ['.product-form', '.product__form', 'form[action*="/cart/add"]'];
    for (var i = 0; i < beforeFormSelectors.length; i++) {
      var form = document.querySelector(beforeFormSelectors[i]);
      if (form) { form.parentNode.insertBefore(container, form); inserted = true; break; }
    }
    if (!inserted) {
      var descSelectors = [
        '.product__description', '.product-description', '[class*="product-description"]',
        '.product__info .rte', '.product-single__description', '.product__details .rte',
        '[data-product-description]',
      ];
      for (var j = 0; j < descSelectors.length; j++) {
        var desc = document.querySelector(descSelectors[j]);
        if (desc) { desc.parentNode.insertBefore(container, desc.nextSibling); inserted = true; break; }
      }
    }
    if (!inserted) {
      var fallbackSelectors = ['.product__info-container', '.product-single__meta', '.product__info', 'main .product', 'main'];
      for (var k = 0; k < fallbackSelectors.length; k++) {
        var wrap = document.querySelector(fallbackSelectors[k]);
        if (wrap) { wrap.appendChild(container); inserted = true; break; }
      }
    }
    if (!inserted) return;

    new RentficWidget(container);
  }

  // ─── Widget ───────────────────────────────────────────────────────────────────
  class RentficWidget {
    constructor(container) {
      this.container    = container;
      this.productId    = container.dataset.productId;
      this.currency     = container.dataset.currency     || 'USD';
      this.moneyFmt     = container.dataset.moneyFormat  || '{{amount}}';
      this.primaryColor = container.dataset.primaryColor || '#008060';
      this.buttonText   = container.dataset.buttonText   || 'Reserve Now';

      this.apartment    = null;
      this.shopSettings = null;

      this.startDate     = null;
      this.endDate       = null;
      this.selectedDates = [];
      this.hoverDate     = null;

      this.viewYear  = null;
      this.viewMonth = null;

      this.guests   = { adults: 1, children: 0, infants: 0 };
      this.quantity = 1;
      this.calOpen  = true;

      this._init();
    }

    async _init() {
      try {
        const res  = await fetch('/apps/rentfic/apartment/' + this.productId);
        if (!res.ok) throw new Error('API error ' + res.status);
        const data = await res.json();
        if (!data.found) { this.container.remove(); return; }
        this.apartment    = data.apartment;
        this.shopSettings = data.shopSettings || {};
        this.calOpen      = (this.shopSettings.displayCalendar || 'always_open') !== 'default';
        this._setInitialViewMonth();
        this._render();
        document.dispatchEvent(new CustomEvent('rentfic:ready'));
      } catch (err) {
        console.error('[Rentfic] widget error:', err);
        this.container.innerHTML = `<div style="padding:16px;font-size:13px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">Booking widget failed to load. Check console for details.</div>`;
      }
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    _setInitialViewMonth() {
      const today = new Date(); today.setHours(0,0,0,0);
      if ((this.shopSettings.startCalendar || 'current_date') === 'first_available') {
        const probe = new Date(today);
        for (let i = 0; i < 365; i++) {
          if (this._isSelectable(probe)) {
            this.viewYear  = probe.getFullYear();
            this.viewMonth = probe.getMonth();
            return;
          }
          probe.setDate(probe.getDate() + 1);
        }
      }
      this.viewYear  = today.getFullYear();
      this.viewMonth = today.getMonth();
    }

    _toStr(d) {
      return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
    }

    _parse(s) {
      if (!s) return null;
      const [y, m, d] = s.split('-').map(Number);
      return new Date(y, m - 1, d);
    }

    _nights(a, b) { return Math.round((b - a) / 86400000); }

    _isBlocked(date) {
      const s = this._toStr(date);
      return (this.apartment.blockedDates || []).includes(s) ||
             (this.shopSettings.blockedDates || []).includes(s);
    }

    _isInBounds(date) {
      const today = new Date(); today.setHours(0,0,0,0);
      if (date < today) return false;
      const { calendarStartDate: cs, calendarEndDate: ce } = this.apartment;
      if (cs && date < this._parse(cs)) return false;
      if (ce && date > this._parse(ce)) return false;
      return true;
    }

    _isWeekdayOn(date) {
      const wa = this.apartment.weeklyAvailability;
      if (!wa) return true;
      const day = WEEK_DAYS[date.getDay()];
      return wa[day] ? wa[day].enabled !== false : true;
    }

    _isSelectable(date) {
      return this._isInBounds(date) && !this._isBlocked(date) && this._isWeekdayOn(date);
    }

    // Visual selectability — extends _isSelectable with state-aware min/max day constraints
    _isCalendarSelectable(date) {
      if (!this._isSelectable(date)) return false;
      const { bookingType, minDays, maxDays } = this.apartment;

      // Range: once start is picked but end isn't, constrain the valid end-date window.
      // Disabled dates inside the window are skipped — they don't count toward min/max.
      if (bookingType === 'range' && this.startDate && !this.endDate) {
        // The start date itself stays clickable (so user can click it to clear the selection)
        if (this._toStr(date) === this._toStr(this.startDate)) return true;
        if (date < this.startDate) return false;
        const n = this._countSelectableNights(this.startDate, date);
        if (minDays && n < minDays) return false;
        if (maxDays && n > maxDays) return false;
      }

      // Multiple: once the limit is reached, only already-selected dates remain clickable (for deselection)
      if (bookingType === 'multiple' && maxDays && this.selectedDates.length >= maxDays) {
        const s = this._toStr(date);
        return this.selectedDates.some(d => this._toStr(d) === s);
      }

      return true;
    }

    _isSelected(date) {
      const s = this._toStr(date);
      const { bookingType } = this.apartment;
      if (bookingType === 'single')   return this.startDate && this._toStr(this.startDate) === s;
      if (bookingType === 'range')    return (this.startDate && this._toStr(this.startDate) === s) || (this.endDate && this._toStr(this.endDate) === s);
      if (bookingType === 'multiple') return this.selectedDates.some(d => this._toStr(d) === s);
      return false;
    }

    _isInRange(date) {
      if (!this.startDate) return false;
      const upper = this.endDate || this.hoverDate;
      return upper ? date > this.startDate && date < upper : false;
    }

    _isRangeEdge(date, edge) {
      const d = edge === 'start' ? this.startDate : (this.endDate || this.hoverDate);
      return d && this._toStr(date) === this._toStr(d);
    }

    // Count selectable (non-blocked, weekday-on) nights from start (inclusive) to end (exclusive).
    // Disabled dates inside a range are skipped and don't count toward min/max or pricing.
    _countSelectableNights(start, end) {
      let count = 0;
      const d = new Date(start);
      while (d < end) {
        if (this._isSelectable(d)) count++;
        d.setDate(d.getDate() + 1);
      }
      return count;
    }

    _calcNights() {
      const { bookingType } = this.apartment;
      if (bookingType === 'range'    && this.startDate && this.endDate) return this._countSelectableNights(this.startDate, this.endDate);
      if (bookingType === 'single'   && this.startDate)                 return 1;
      if (bookingType === 'multiple')                                   return this.selectedDates.length;
      return 0;
    }

    _totalGuests() {
      return this.guests.adults + this.guests.children + this.guests.infants;
    }

    _calcFees(nights) {
      const qty  = this.quantity;
      const base = qty * nights * (this.apartment.pricePerNight || 0);
      return (this.apartment.additionalFees || []).map(fee => {
        let computed;
        if (fee.type === 'percent') {
          computed = base * (parseFloat(fee.amount) / 100);
        } else if (fee.applyPer === 'night') {
          computed = qty * nights * parseFloat(fee.amount);
        } else {
          // flat per-booking: charged once per unit
          computed = qty * parseFloat(fee.amount);
        }
        return { name: fee.name, type: fee.type, amount: fee.amount, applyPer: fee.applyPer, computed };
      });
    }

    _getSelectedDateStrings() {
      const { bookingType } = this.apartment;
      const dates = [];
      if (bookingType === 'single' && this.startDate) {
        dates.push(this._toStr(this.startDate));
      } else if (bookingType === 'range' && this.startDate && this.endDate) {
        const d = new Date(this.startDate);
        while (d < this.endDate) {
          dates.push(this._toStr(d));
          d.setDate(d.getDate() + 1);
        }
      } else if (bookingType === 'multiple') {
        this.selectedDates.forEach(d => dates.push(this._toStr(d)));
      }
      return dates;
    }

    _calcDiscount(base, nights) {
      let total = 0;

      // Rule-based conditional discounts
      const rules = this.apartment.conditionalDiscounts || [];
      for (const rule of rules) {
        const cv = parseFloat(rule.conditionValue) || 0;
        let met = false;
        if (rule.condition === 'minDays'   && nights >= cv)              met = true;
        if (rule.condition === 'minTotal'  && base >= cv)                met = true;
        if (rule.condition === 'minQty'    && this._totalGuests() >= cv) met = true;
        if (met) {
          let d = rule.discountType === 'percent'
            ? base * (parseFloat(rule.discountValue) / 100)
            : parseFloat(rule.discountValue) || 0;
          if (rule.applyMode === 'each') d *= nights;
          total += d;
        }
      }

      // Date-specific discounts
      const discountedGroups = this.apartment.discountedDates || [];
      if (discountedGroups.length > 0 && nights > 0) {
        const selectedStrs    = this._getSelectedDateStrings();
        const pricePerNight   = this.apartment.pricePerNight || 0;
        for (const group of discountedGroups) {
          const groupDates     = group.dates || [];
          const matchingNights = selectedStrs.filter(s => groupDates.includes(s)).length;
          if (matchingNights > 0) {
            const matchBase = this.quantity * matchingNights * pricePerNight;
            const disc = group.type === 'percent'
              ? matchBase * (parseFloat(group.value) / 100)
              : parseFloat(group.value) * matchingNights;
            total += disc;
          }
        }
      }

      return total;
    }

    _calcTotal() {
      const nights = this._calcNights();
      const qty    = this.quantity;
      const base   = qty * nights * (this.apartment.pricePerNight || 0);
      const fees   = this._calcFees(nights).reduce((s, f) => s + f.computed, 0);
      const disc   = this._calcDiscount(base, nights);
      return Math.max(0, base + fees - disc);
    }

    _calcDeposit(total) {
      const { depositEnabled, depositType, depositAmount } = this.apartment;
      if (depositEnabled && depositAmount) {
        return depositType === 'percent' ? total * (depositAmount / 100) : depositAmount;
      }
      const { depositType: sdt, depositValue: sdv } = this.shopSettings;
      if (sdv) return sdt === 'percent' ? total * (sdv / 100) : sdv;
      return null;
    }

    _fmtPrice(amount) {
      return this.moneyFmt.replace(/\{\{amount[^}]*\}\}/g, parseFloat(amount || 0).toFixed(2));
    }

    _fmtTime(t) {
      if (!t) return null;
      const [h, m] = t.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
    }

    // ─── Selection ───────────────────────────────────────────────────────────

    _handleClick(date) {
      if (!this._isSelectable(date)) return;
      const { bookingType, minDays, maxDays } = this.apartment;

      if (bookingType === 'single') {
        this.startDate = date;
      } else if (bookingType === 'multiple') {
        const s   = this._toStr(date);
        const idx = this.selectedDates.findIndex(d => this._toStr(d) === s);
        if (idx >= 0) {
          this.selectedDates.splice(idx, 1);
        } else {
          if (maxDays && this.selectedDates.length >= maxDays) return;
          this.selectedDates.push(new Date(date));
        }
      } else {
        if (!this.startDate || (this.startDate && this.endDate)) {
          // No selection yet, or both dates already set — start fresh
          this.startDate = date; this.endDate = null; this.hoverDate = null;
        } else if (this._toStr(date) === this._toStr(this.startDate)) {
          // Clicking the start date again clears the entire selection
          this.startDate = null; this.endDate = null; this.hoverDate = null;
        } else if (date < this.startDate) {
          // Clicking before start (shouldn't normally be reachable since those cells are disabled, but fallback)
          this.startDate = date; this.endDate = null; this.hoverDate = null;
        } else {
          const n = this._countSelectableNights(this.startDate, date);
          if (minDays && n < minDays) return;
          if (maxDays && n > maxDays) return;
          this.endDate = date; this.hoverDate = null;
        }
      }
      this._render();
    }

    _hasSelection() {
      const { bookingType } = this.apartment;
      if (bookingType === 'single')   return !!this.startDate;
      if (bookingType === 'range')    return !!(this.startDate && this.endDate);
      if (bookingType === 'multiple') return this.selectedDates.length > 0;
      return false;
    }

    // ─── Render ──────────────────────────────────────────────────────────────

    _render() {
      try { this._renderInner(); } catch (err) {
        console.error('[Rentfic] render error:', err);
        this.container.innerHTML = `<div style="padding:16px;font-size:13px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px">Widget render error: ${err.message}</div>`;
      }
    }

    _renderInner() {
      const { bookingType, pricePerNight, minDays, maxDays } = this.apartment;
      const nights  = this._calcNights();
      const total   = this._calcTotal();
      const deposit = this._calcDeposit(total);
      const hasSel  = this._hasSelection();

      let hint = '';
      if      (bookingType === 'range'    && !this.startDate) hint = 'Select check-in date';
      else if (bookingType === 'range'    && !this.endDate) {
        const parts = [];
        if (minDays > 1) parts.push(`min ${minDays} nights`);
        if (maxDays)     parts.push(`max ${maxDays} nights`);
        hint = parts.length ? `Select check-out (${parts.join(', ')})` : 'Select check-out date';
      }
      else if (bookingType === 'single'   && !this.startDate) hint = 'Select a date';
      else if (bookingType === 'multiple') {
        const remaining = maxDays ? maxDays - this.selectedDates.length : null;
        const parts = [];
        if (minDays > 1) parts.push(`min ${minDays} dates`);
        if (maxDays)     parts.push(`max ${maxDays} dates`);
        if (remaining !== null && remaining === 0) hint = `Maximum ${maxDays} dates selected`;
        else if (remaining !== null && remaining > 0 && this.selectedDates.length > 0)
          hint = `${remaining} more date${remaining !== 1 ? 's' : ''} available (max ${maxDays})`;
        else hint = parts.length ? `Select dates · ${parts.join(', ')}` : 'Select one or more dates';
      }

      const calDefault  = (this.shopSettings.displayCalendar || 'always_open') === 'default';
      const showCal     = !calDefault || this.calOpen;

      this.container.innerHTML = `
        <div class="rentfic-widget" style="--rf-primary:${this.primaryColor}">
          ${this._renderHeader(pricePerNight)}
          ${this._renderInfoStrip()}
          ${this._renderAmenities()}
          ${calDefault ? `<button class="rentfic-toggle-cal" id="rf-toggle-cal">${this.calOpen ? '▲ Hide Calendar' : '▼ Show Calendar'}</button>` : ''}
          ${hint && showCal ? `<p class="rentfic-hint">${hint}</p>` : ''}
          ${showCal ? this._renderCal() : ''}
          ${this._renderGuestSelector()}
          ${this._renderQuantitySelector()}
          ${hasSel ? this._renderSummary(nights, total, deposit) : ''}
          ${hasSel ? `<button class="rentfic-reserve-btn" id="rf-reserve">${this.buttonText}</button>` : ''}
          <div id="rf-msg" class="rentfic-msg" style="display:none"></div>
        </div>
      `;

      this._listen();

      // Keep the theme's visible price in sync with the amount charged at checkout
      if (this._hasSelection()) {
        const total   = this._calcTotal();
        const deposit = this._calcDeposit(total);
        this._syncPagePrice(deposit !== null ? deposit : total);
      } else {
        this._syncPagePrice(this.apartment.pricePerNight || 0);
      }
    }

    _renderHeader(pricePerNight) {
      const hasSel = this._hasSelection();
      const nights = this._calcNights();
      const total  = this._calcTotal();
      const fp     = this.shopSettings.fromPrice || 'automatic';

      let priceHtml = '';
      if (fp !== 'disabled') {
        const showFrom = !hasSel && fp !== 'automatic';
        const perLabel = fp === 'minimum_per_day' ? '/ day' : '/ night';
        priceHtml = `
          <div style="display:flex;align-items:baseline;gap:6px">
            ${showFrom ? `<span class="rentfic-price-per">From</span>` : ''}
            <span class="rentfic-price-amount">${this._fmtPrice(pricePerNight)}</span>
            <span class="rentfic-price-per">${perLabel}</span>
          </div>
        `;
      }

      return `
        <div class="rentfic-header">
          ${priceHtml}
          ${hasSel && nights > 0 ? `
            <div class="rf-total-pill">
              Total: <strong>${this._fmtPrice(total)}</strong>
              <span class="rf-total-nights">(${nights} night${nights !== 1 ? 's' : ''})</span>
            </div>` : ''}
        </div>
      `;
    }

    // Update the Shopify theme's own price display to match the calculated total
    _syncPagePrice(price) {
      const selectors = [
        '.price__regular .price-item--regular',
        '.price-item.price-item--regular',
        '[data-product-price]',
        '.product__price .money',
        '.product-single__price .money',
        '.price .money',
      ];
      for (const sel of selectors) {
        document.querySelectorAll(sel).forEach(el => {
          el.textContent = this._fmtPrice(price);
        });
      }
    }

    _renderInfoStrip() {
      const { bedrooms, bathrooms, maxGuests, checkInTime, checkOutTime, minDays, city, country } = this.apartment;
      const items = [];
      if (bedrooms)    items.push(`🛏 ${bedrooms} bed${bedrooms !== 1 ? 's' : ''}`);
      if (bathrooms)   items.push(`🚿 ${bathrooms} bath${bathrooms !== 1 ? 's' : ''}`);
      if (maxGuests)   items.push(`👥 Max ${maxGuests} guests`);
      if (checkInTime)  items.push(`🔑 Check-in ${this._fmtTime(checkInTime)}`);
      if (checkOutTime) items.push(`🚪 Check-out ${this._fmtTime(checkOutTime)}`);
      if (minDays > 1) items.push(this.apartment.bookingType === 'multiple' ? `📅 Min ${minDays} dates` : `🌙 Min ${minDays} nights`);
      if (city || country) items.push(`📍 ${[city, country].filter(Boolean).join(', ')}`);
      if (!items.length) return '';
      return `
        <div class="rf-info-strip">
          ${items.map(i => `<span class="rf-info-item">${i}</span>`).join('')}
        </div>
      `;
    }

    _renderAmenities() {
      const list = this.apartment.amenities || [];
      if (!list.length) return '';
      const shown = list.slice(0, 8);
      const more  = list.length - shown.length;
      return `
        <div class="rf-amenities">
          ${shown.map(a => `<span class="rf-amenity-tag">${a}</span>`).join('')}
          ${more > 0 ? `<span class="rf-amenity-more">+${more} more</span>` : ''}
        </div>
      `;
    }

    _renderGuestSelector() {
      const { maxAdults, maxChildren, maxInfants, maxGuests } = this.apartment;
      const totalG = this._totalGuests();

      const rows = [
        { key: 'adults',   label: 'Adults',   sub: 'Ages 13+',  min: 1, max: maxAdults },
        { key: 'children', label: 'Children', sub: 'Ages 2–12', min: 0, max: maxChildren },
        { key: 'infants',  label: 'Infants',  sub: 'Under 2',   min: 0, max: maxInfants },
      ];

      return `
        <div class="rf-guest-section">
          <div class="rf-section-title">Guests</div>
          ${rows.map(row => {
            const val   = this.guests[row.key];
            const atMin = val <= row.min;
            const atMax = (row.max != null && val >= row.max) || (maxGuests != null && totalG >= maxGuests && row.key !== 'adults');
            return `
              <div class="rf-guest-row">
                <div class="rf-guest-label">
                  <span class="rf-guest-name">${row.label}</span>
                  <span class="rf-guest-sub">${row.sub}${row.max ? ` · max ${row.max}` : ''}</span>
                </div>
                <div class="rf-stepper">
                  <button class="rf-step-btn" data-guest="${row.key}" data-dir="-1" ${atMin ? 'disabled' : ''}>−</button>
                  <span class="rf-step-val">${val}</span>
                  <button class="rf-step-btn" data-guest="${row.key}" data-dir="1" ${atMax ? 'disabled' : ''}>+</button>
                </div>
              </div>
            `;
          }).join('')}
          ${maxGuests ? `<div class="rf-guest-max-hint">${totalG} of ${maxGuests} max guests selected</div>` : ''}
        </div>
      `;
    }

    _renderQuantitySelector() {
      const { quantityEnabled, stockQuantity } = this.apartment;
      const position = this.shopSettings.quantityPosition || 'product_and_calendar';
      if (!quantityEnabled || position === 'product_page') return '';

      const maxQty = stockQuantity ? parseInt(stockQuantity) : 99;
      const atMin  = this.quantity <= 1;
      const atMax  = this.quantity >= maxQty;

      return `
        <div class="rf-qty-section">
          <div class="rf-section-title">Quantity</div>
          <div class="rf-qty-row">
            <div class="rf-guest-label">
              <span class="rf-guest-name">Units</span>
              <span class="rf-guest-sub">Number of units to book${stockQuantity ? ` · max ${maxQty}` : ''}</span>
            </div>
            <div class="rf-stepper">
              <button class="rf-step-btn" data-qty="-1" ${atMin ? 'disabled' : ''}>−</button>
              <span class="rf-step-val">${this.quantity}</span>
              <button class="rf-step-btn" data-qty="1" ${atMax ? 'disabled' : ''}>+</button>
            </div>
          </div>
          ${stockQuantity ? `<div class="rf-guest-max-hint">${maxQty - this.quantity} of ${maxQty} units still available</div>` : ''}
        </div>
      `;
    }

    _renderCal() {
      const y     = this.viewYear;
      const m     = this.viewMonth;
      const first = new Date(y, m, 1).getDay();
      const days  = new Date(y, m + 1, 0).getDate();

      let html = `
        <div class="rentfic-calendar">
          <div class="rf-cal-head">
            <button class="rf-nav" data-dir="prev">&#8249;</button>
            <span class="rf-cal-title">${MONTH_NAMES[m]} ${y}</span>
            <button class="rf-nav" data-dir="next">&#8250;</button>
          </div>
          <div class="rf-cal-grid">
            ${DAY_NAMES.map(d => `<div class="rf-dow">${d}</div>`).join('')}
      `;

      for (let i = 0; i < first; i++) html += '<div class="rf-cell empty"></div>';

      for (let d = 1; d <= days; d++) {
        const date     = new Date(y, m, d);
        const inBounds = this._isInBounds(date);
        const sel      = inBounds && this._isCalendarSelectable(date);
        const slctd    = this._isSelected(date);
        const range    = this._isInRange(date);
        const rS       = this._isRangeEdge(date, 'start');
        const rE       = this._isRangeEdge(date, 'end');

        let cls = 'rf-cell';
        if (!inBounds) cls += ' out-of-bounds';
        else if (!sel) cls += ' disabled';
        if (slctd) cls += ' selected';
        if (range) cls += ' in-range';
        if (rS)    cls += ' range-start';
        if (rE)    cls += ' range-end';

        html += `<div class="${cls}" data-date="${this._toStr(date)}">${d}</div>`;
      }

      return html + '</div></div>';
    }

    _renderSummary(nights, total, deposit) {
      const { bookingType, pricePerNight } = this.apartment;
      const base   = this.quantity * nights * (pricePerNight || 0);
      const fees   = this._calcFees(nights);
      const disc   = this._calcDiscount(base, nights);

      let dateLabel = '';
      if      (bookingType === 'range'    && this.startDate && this.endDate) dateLabel = `${this._toStr(this.startDate)} &rarr; ${this._toStr(this.endDate)}`;
      else if (bookingType === 'single'   && this.startDate)                 dateLabel = this._toStr(this.startDate);
      else if (bookingType === 'multiple')                                   dateLabel = `${nights} date${nights !== 1 ? 's' : ''} selected`;

      return `
        <div class="rentfic-summary">
          <div class="rf-section-title" style="margin-bottom:10px">Price breakdown</div>
          ${dateLabel ? `<div class="rf-sum-row rf-sum-dates"><span>${dateLabel}</span></div>` : ''}
          <div class="rf-sum-row">
            <span>
              ${this.quantity > 1 ? `${this.quantity} units × ` : ''}${nights} night${nights !== 1 ? 's' : ''} × ${this._fmtPrice(pricePerNight)}
            </span>
            <span>${this._fmtPrice(base)}</span>
          </div>
          ${fees.map(fee => `
            <div class="rf-sum-row rf-fee-row">
              <span>${fee.name}${fee.applyPer === 'night' ? ' <em>(per night)</em>' : ''}</span>
              <span>${this._fmtPrice(fee.computed)}</span>
            </div>
          `).join('')}
          ${disc > 0 ? `
            <div class="rf-sum-row rf-discount-row">
              <span>Discount applied</span>
              <span>−${this._fmtPrice(disc)}</span>
            </div>
          ` : ''}
          <div class="rf-sum-row rf-total">
            <strong>Total</strong><strong>${this._fmtPrice(total)}</strong>
          </div>
          ${deposit !== null ? `
            <div class="rf-sum-row rf-deposit">
              <span>Deposit due now</span>
              <span>${this._fmtPrice(deposit)}</span>
            </div>
          ` : ''}
        </div>
      `;
    }

    // ─── Events ──────────────────────────────────────────────────────────────

    _listen() {
      // Toggle calendar (displayCalendar: default)
      const toggleCalBtn = this.container.querySelector('#rf-toggle-cal');
      if (toggleCalBtn) {
        toggleCalBtn.addEventListener('click', () => {
          this.calOpen = !this.calOpen;
          this._render();
        });
      }

      // Calendar nav
      this.container.querySelectorAll('.rf-nav').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.dataset.dir === 'prev') {
            if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear--; }
            else this.viewMonth--;
          } else {
            if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear++; }
            else this.viewMonth++;
          }
          this._render();
        });
      });

      // Date cells
      this.container.querySelectorAll('.rf-cell[data-date]').forEach(cell => {
        cell.addEventListener('click', () => this._handleClick(this._parse(cell.dataset.date)));
        if (this.apartment.bookingType === 'range') {
          cell.addEventListener('mouseenter', () => {
            if (!this.startDate || this.endDate) return;
            const hovered = this._parse(cell.dataset.date);
            const { minDays, maxDays } = this.apartment;
            // Only show hover preview for dates within the valid end-date window
            if (hovered <= this.startDate) { this.hoverDate = null; }
            else {
              const n = this._countSelectableNights(this.startDate, hovered);
              if ((minDays && n < minDays) || (maxDays && n > maxDays)) {
                this.hoverDate = null;
              } else {
                this.hoverDate = hovered;
              }
            }
            this.container.querySelectorAll('.rf-cell[data-date]').forEach(c => {
              const d = this._parse(c.dataset.date);
              c.classList.toggle('in-range',  this._isInRange(d));
              c.classList.toggle('range-end', this._isRangeEdge(d, 'end'));
            });
          });
        }
      });

      // Guest steppers
      this.container.querySelectorAll('.rf-step-btn[data-guest]').forEach(btn => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.guest;
          const dir = parseInt(btn.dataset.dir);
          const { maxAdults, maxChildren, maxInfants, maxGuests } = this.apartment;
          const limits = {
            adults:   { min: 1, max: maxAdults   || 99 },
            children: { min: 0, max: maxChildren  || 99 },
            infants:  { min: 0, max: maxInfants   || 99 },
          };
          const cur  = this.guests[key];
          const next = cur + dir;
          if (next < limits[key].min) return;
          if (next > limits[key].max) return;
          if (dir > 0 && maxGuests && this._totalGuests() >= maxGuests) return;
          this.guests[key] = next;
          this._render();
        });
      });

      // Quantity stepper
      this.container.querySelectorAll('.rf-step-btn[data-qty]').forEach(btn => {
        btn.addEventListener('click', () => {
          const dir    = parseInt(btn.dataset.qty);
          const maxQty = this.apartment.stockQuantity ? parseInt(this.apartment.stockQuantity) : 99;
          const next   = this.quantity + dir;
          if (next < 1 || next > maxQty) return;
          this.quantity = next;
          this._render();
        });
      });

      // Reserve button
      const btn = this.container.querySelector('#rf-reserve');
      if (btn) btn.addEventListener('click', () => this._reserve());
    }

    // ─── Reserve ─────────────────────────────────────────────────────────────

    async _reserve() {
      const btn = this.container.querySelector('#rf-reserve');
      if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

      const { bookingType, minDays, maxDays } = this.apartment;
      const nights = this._calcNights();

      // Validate min/max for multiple type
      if (bookingType === 'multiple') {
        if (minDays && nights < minDays) {
          this._msg(`Please select at least ${minDays} dates.`, 'warning');
          if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
          return;
        }
        if (maxDays && nights > maxDays) {
          this._msg(`Please select no more than ${maxDays} dates.`, 'warning');
          if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
          return;
        }
      }
      const total  = this._calcTotal();
      let startDate, endDate, bookingDates;

      if (bookingType === 'range') {
        startDate = this._toStr(this.startDate);
        endDate   = this._toStr(this.endDate);
      } else if (bookingType === 'single') {
        startDate = endDate = this._toStr(this.startDate);
      } else {
        const sorted = [...this.selectedDates].sort((a, b) => a - b);
        startDate    = this._toStr(sorted[0]);
        endDate      = this._toStr(sorted[sorted.length - 1]);
        bookingDates = sorted.map(d => this._toStr(d));
      }

      try {
        // 1. Create booking — server recalculates total and updates variant price
        const bRes  = await fetch('/apps/rentfic/booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apartmentId: this.apartment.id,
            startDate, endDate, nights, bookingType, bookingDates,
            guests:    this.guests,
            quantity:  this.quantity,
          }),
        });
        const bData = await bRes.json();

        if (!bData.success) {
          this._msg(bData.error || 'Booking failed. Please try again.', 'error');
          if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
          return;
        }

        const variantId = this._getVariant();
        if (!variantId) {
          this._msg('Could not find product variant. Please refresh.', 'error');
          if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
          return;
        }

        const properties = {
          'Check-in':     startDate,
          'Check-out':    endDate,
          'Nights':       String(nights),
          'Units':        String(this.quantity),
          'Adults':       String(this.guests.adults),
          'Children':     String(this.guests.children),
          'Infants':      String(this.guests.infants),
          'Total Guests': String(this._totalGuests()),
          'Total Price':  this._fmtPrice(bData.finalTotal),
          '_booking_id':  bData.bookingId,
        };
        if (bookingDates) properties['Dates'] = bookingDates.join(', ');
        if (bData.isDeposit) {
          properties['Deposit Paid']  = this._fmtPrice(bData.depositCharged);
          properties['Balance Due']   = this._fmtPrice(bData.finalTotal - bData.depositCharged);
        }

        // 2. Add to cart — variant price has been set to finalTotal by the server
        const cartRes = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: variantId, quantity: 1, properties }),
        });

        if (!cartRes.ok) {
          this._msg('Booking saved but cart update failed. Please refresh.', 'warning');
          return;
        }

        // 3. Reset variant price back to pricePerNight (fire-and-forget)
        fetch('/apps/rentfic/price-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId: this.productId, price: bData.resetPrice }),
        }).catch(() => {});

        // 4. Redirect based on shop setting
        const redirect = this.shopSettings.redirectAfterCart || 'automatic';
        if (redirect === 'redirect_to_cart') {
          window.location.href = '/cart';
        } else if (redirect === 'disabled') {
          if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
          this._msg('Booking confirmed! Your reservation has been added to the cart.', 'success');
        } else {
          // 'automatic' or 'redirect_to_checkout'
          window.location.href = '/checkout';
        }

      } catch (_) {
        this._msg('An error occurred. Please try again.', 'error');
        if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
      }
    }

    _getVariant() {
      const inp = document.querySelector('form[action*="/cart/add"] [name="id"]');
      return inp ? inp.value : null;
    }

    _msg(text, type) {
      const el = this.container.querySelector('#rf-msg');
      if (!el) return;
      el.textContent   = text;
      el.className     = 'rentfic-msg ' + type;
      el.style.display = 'block';
    }
  }

  // ─── Boot ─────────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

})();
