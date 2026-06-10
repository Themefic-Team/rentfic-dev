(function () {
  'use strict';

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const WEEK_DAYS  = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  // ─── Auto-inject entry point ──────────────────────────────────────────────
  function boot() {
    const embed = document.getElementById('rentfic-app-embed');
    if (!embed || embed.dataset.enabled === 'false') return;

    // Only run on product pages
    const match = window.location.pathname.match(/\/products\/([^/?#]+)/);
    if (!match) return;

    const handle = match[1];

    // Get numeric product ID from Shopify's product JSON endpoint
    fetch('/products/' + handle + '.js')
      .then(function (r) { return r.json(); })
      .then(function (product) { injectWidget(embed, product.id); })
      .catch(function () { /* not a rentfic product, stay silent */ });
  }

  function injectWidget(embed, productId) {
    // Create the widget container
    var container = document.createElement('div');
    container.id = 'rentfic-booking-widget';
    container.dataset.productId  = productId;
    container.dataset.currency   = embed.dataset.currency   || 'USD';
    container.dataset.moneyFormat = embed.dataset.moneyFormat || '{{amount}}';
    container.dataset.primaryColor = embed.dataset.primaryColor || '#008060';
    container.dataset.buttonText  = embed.dataset.buttonText  || 'Reserve Now';
    container.innerHTML = '<div class="rentfic-loading">Checking availability…</div>';

    // Insert after the product description — try common theme selectors
    var inserted = false;
    var descSelectors = [
      '.product__description',
      '.product-description',
      '[class*="product-description"]',
      '.product__info .rte',
      '.product-single__description',
      '.product__details .rte',
      '[data-product-description]',
    ];

    for (var i = 0; i < descSelectors.length; i++) {
      var desc = document.querySelector(descSelectors[i]);
      if (desc) {
        desc.parentNode.insertBefore(container, desc.nextSibling);
        inserted = true;
        break;
      }
    }

    // Fallback: append to the product info / main content area
    if (!inserted) {
      var fallbackSelectors = [
        '.product__info-container',
        '.product-single__meta',
        '.product__info',
        'main .product',
        'main',
      ];
      for (var j = 0; j < fallbackSelectors.length; j++) {
        var wrap = document.querySelector(fallbackSelectors[j]);
        if (wrap) { wrap.appendChild(container); inserted = true; break; }
      }
    }

    if (!inserted) return; // can't find a place to inject

    new RentficWidget(container);
  }

  // ─── Widget class ─────────────────────────────────────────────────────────

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

      this._init();
    }

    async _init() {
      try {
        const res  = await fetch('/apps/rentfic/apartment/' + this.productId);
        const data = await res.json();

        if (!data.found) {
          // Product is not registered as a rentfic apartment — remove injected element
          this.container.remove();
          return;
        }

        this.apartment    = data.apartment;
        this.shopSettings = data.shopSettings || {};

        this._hideNativeButtons();
        this._setInitialViewMonth();
        this._render();
      } catch (_) {
        this.container.remove();
      }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────

    _hideNativeButtons() {
      const style = document.createElement('style');
      style.textContent = `
        .product-form__quantity,
        .quantity,
        .product__quantity,
        [class*="quantity-wrapper"],
        .product-form__submit,
        button[name="add"],
        [data-type="add-to-cart-button"],
        .shopify-payment-button,
        .product-form__payment-button,
        .product-form__buttons { display: none !important; }
      `;
      document.head.appendChild(style);
    }

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

    _calcNights() {
      const { bookingType } = this.apartment;
      if (bookingType === 'range'    && this.startDate && this.endDate) return this._nights(this.startDate, this.endDate);
      if (bookingType === 'single'   && this.startDate)                 return 1;
      if (bookingType === 'multiple')                                   return this.selectedDates.length;
      return 0;
    }

    _calcTotal()   { return this._calcNights() * (this.apartment.pricePerNight || 0); }

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
      return this.moneyFmt.replace(/\{\{amount[^}]*\}\}/g, parseFloat(amount).toFixed(2));
    }

    // ─── Selection ────────────────────────────────────────────────────────

    _handleClick(date) {
      if (!this._isSelectable(date)) return;
      const { bookingType, minNights, maxNights } = this.apartment;

      if (bookingType === 'single') {
        this.startDate = date;

      } else if (bookingType === 'multiple') {
        const s   = this._toStr(date);
        const idx = this.selectedDates.findIndex(d => this._toStr(d) === s);
        idx >= 0 ? this.selectedDates.splice(idx, 1) : this.selectedDates.push(new Date(date));

      } else { // range
        if (!this.startDate || (this.startDate && this.endDate)) {
          this.startDate = date; this.endDate = null; this.hoverDate = null;
        } else if (date <= this.startDate) {
          this.startDate = date; this.endDate = null; this.hoverDate = null;
        } else {
          const n = this._nights(this.startDate, date);
          if (minNights && n < minNights) return;
          if (maxNights && n > maxNights) return;
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

    // ─── Render ───────────────────────────────────────────────────────────

    _render() {
      const { bookingType, pricePerNight, minNights } = this.apartment;
      const displayCal = this.shopSettings.displayCalendar || 'always_open';
      const nights     = this._calcNights();
      const total      = this._calcTotal();
      const deposit    = this._calcDeposit(total);
      const hasSel     = this._hasSelection();

      let hint = '';
      if      (bookingType === 'range' && !this.startDate)  hint = 'Select check-in date';
      else if (bookingType === 'range' && !this.endDate)    hint = minNights > 1 ? `Select check-out (min ${minNights} nights)` : 'Select check-out date';
      else if (bookingType === 'single' && !this.startDate) hint = 'Select a date';
      else if (bookingType === 'multiple')                  hint = 'Select one or more dates';

      const showCalAlways = displayCal === 'always_open';

      this.container.innerHTML = `
        <div class="rentfic-widget" style="--rf-primary:${this.primaryColor}">
          <div class="rentfic-header">
            <span class="rentfic-price-amount">${this._fmtPrice(pricePerNight)}</span>
            <span class="rentfic-price-per">&nbsp;/ night</span>
          </div>
          ${hint ? `<p class="rentfic-hint">${hint}</p>` : ''}
          ${showCalAlways
            ? this._renderCal()
            : `<button class="rentfic-toggle-cal" id="rf-toggle">&#128197; ${this.startDate ? 'Change dates' : 'Select dates'}</button>
               <div id="rf-cal-wrap" style="display:none">${this._renderCal()}</div>`
          }
          ${hasSel ? this._renderSummary(nights, total, deposit) : ''}
          ${hasSel ? `<button class="rentfic-reserve-btn" id="rf-reserve">${this.buttonText}</button>` : ''}
          <div id="rf-msg" class="rentfic-msg" style="display:none"></div>
        </div>
      `;

      this._listen();
    }

    _renderCal() {
      const y       = this.viewYear;
      const m       = this.viewMonth;
      const first   = new Date(y, m, 1).getDay();
      const days    = new Date(y, m + 1, 0).getDate();

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
        const date  = new Date(y, m, d);
        const sel   = this._isSelectable(date);
        const slctd = this._isSelected(date);
        const range = this._isInRange(date);
        const rS    = this._isRangeEdge(date, 'start');
        const rE    = this._isRangeEdge(date, 'end');

        let cls = 'rf-cell';
        if (!sel)  cls += ' disabled';
        if (slctd) cls += ' selected';
        if (range) cls += ' in-range';
        if (rS)    cls += ' range-start';
        if (rE)    cls += ' range-end';

        html += `<div class="${cls}" data-date="${this._toStr(date)}">${d}</div>`;
      }

      return html + '</div></div>';
    }

    _renderSummary(nights, total, deposit) {
      const { bookingType } = this.apartment;
      let dateLabel = '';
      if      (bookingType === 'range'    && this.startDate && this.endDate) dateLabel = `${this._toStr(this.startDate)} &rarr; ${this._toStr(this.endDate)}`;
      else if (bookingType === 'single'   && this.startDate)                 dateLabel = this._toStr(this.startDate);
      else if (bookingType === 'multiple')                                   dateLabel = `${nights} date${nights !== 1 ? 's' : ''} selected`;

      return `
        <div class="rentfic-summary">
          <div class="rf-sum-row">
            <span>${dateLabel}</span>
            <span>${nights} night${nights !== 1 ? 's' : ''} &times; ${this._fmtPrice(this.apartment.pricePerNight)}</span>
          </div>
          <div class="rf-sum-row rf-total">
            <strong>Total</strong><strong>${this._fmtPrice(total)}</strong>
          </div>
          ${deposit !== null ? `<div class="rf-sum-row rf-deposit"><span>Deposit due now</span><span>${this._fmtPrice(deposit)}</span></div>` : ''}
        </div>
      `;
    }

    // ─── Events ───────────────────────────────────────────────────────────

    _listen() {
      // Nav buttons
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
            this.hoverDate = this._parse(cell.dataset.date);
            this.container.querySelectorAll('.rf-cell[data-date]').forEach(c => {
              const d = this._parse(c.dataset.date);
              c.classList.toggle('in-range',   this._isInRange(d));
              c.classList.toggle('range-end',  this._isRangeEdge(d, 'end'));
            });
          });
        }
      });

      // Toggle calendar
      const toggle = this.container.querySelector('#rf-toggle');
      if (toggle) toggle.addEventListener('click', () => {
        const wrap = this.container.querySelector('#rf-cal-wrap');
        if (wrap) wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
      });

      // Reserve button
      const btn = this.container.querySelector('#rf-reserve');
      if (btn) btn.addEventListener('click', () => this._reserve());
    }

    // ─── Reserve ──────────────────────────────────────────────────────────

    async _reserve() {
      const btn = this.container.querySelector('#rf-reserve');
      if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }

      const { bookingType } = this.apartment;
      const nights = this._calcNights();
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
        // 1. Save booking record
        const bRes  = await fetch('/apps/rentfic/booking', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apartmentId: this.apartment.id, startDate, endDate, nights, total, bookingType, bookingDates }),
        });
        const bData = await bRes.json();

        if (!bData.success) {
          this._msg(bData.error || 'Booking failed. Please try again.', 'error');
          if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
          return;
        }

        // 2. Add to Shopify cart with booking details as line item properties
        const variantId = this._getVariant();
        if (!variantId) {
          this._msg('Could not find product variant. Please refresh.', 'error');
          if (btn) { btn.disabled = false; btn.textContent = this.buttonText; }
          return;
        }

        const properties = {
          'Check-in':    startDate,
          'Check-out':   endDate,
          'Nights':      String(nights),
          '_booking_id': bData.bookingId,
        };
        if (bookingDates) properties['Dates'] = bookingDates.join(', ');

        const cartRes = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: variantId, quantity: 1, properties }),
        });

        if (!cartRes.ok) {
          this._msg('Booking saved but cart update failed. Please refresh.', 'warning');
          return;
        }

        // 3. Redirect per shop setting
        const r = (this.shopSettings.redirectAfterCart || 'automatic');
        if      (r === 'redirect_to_cart')     window.location.href = '/cart';
        else if (r === 'redirect_to_checkout') window.location.href = '/checkout';
        else if (r === 'disabled')             this._msg('Booking confirmed! Item added to cart.', 'success');
        else                                   window.location.href = '/cart';

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
