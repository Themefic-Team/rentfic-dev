(function () {
  'use strict';

  const MONTH_NAMES = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAY_NAMES  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const WEEK_DAYS  = ['sun','mon','tue','wed','thu','fri','sat'];

  const ICONS = {
    bed: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path fill-rule="evenodd" d="M8.344 3.692a2.25 2.25 0 0 1 3.312 0l3.854 4.19a3.75 3.75 0 0 1 .99 2.538v3.33a2.75 2.75 0 0 1-2.75 2.75h-1.75a1.5 1.5 0 0 1-1.5-1.5v-2h-1v2a1.5 1.5 0 0 1-1.5 1.5h-1.75a2.75 2.75 0 0 1-2.75-2.75v-3.33c0-.94.353-1.847.99-2.539l3.854-4.189Zm2.208 1.016a.75.75 0 0 0-1.104 0l-3.854 4.189a2.25 2.25 0 0 0-.594 1.523v3.33c0 .69.56 1.25 1.25 1.25h1.75v-2a1.5 1.5 0 0 1 1.5-1.5h1a1.5 1.5 0 0 1 1.5 1.5v2h1.75c.69 0 1.25-.56 1.25-1.25v-3.33a2.25 2.25 0 0 0-.594-1.523l-3.854-4.19Z"/></svg>',
    bath: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path fill-rule="evenodd" d="M10 2c-4 5-6 8-6 11a6 6 0 0 0 12 0c0-3-2-6-6-11zm0 15a4 4 0 0 1-4-4c0-2.2 1.3-4.6 4-8.3 2.7 3.7 4 6.1 4 8.3a4 4 0 0 1-4 4z"/></svg>',
    person: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path fill-rule="evenodd" d="M10 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Zm0-1.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/><path fill-rule="evenodd" d="M8.827 16h-3.077a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-3.077l.07-.061a17.427 17.427 0 0 0 1.707-1.758c1.224-1.46 2.55-3.574 2.55-5.954 0-3.167-2.328-5.477-5.5-5.477s-5.5 2.31-5.5 5.477c0 2.38 1.326 4.495 2.55 5.954a17.426 17.426 0 0 0 1.777 1.819Zm1.173-11.75c-2.35 0-4 1.646-4 3.977 0 1.846 1.049 3.618 2.2 4.99a15.919 15.919 0 0 0 1.8 1.816 15.92 15.92 0 0 0 1.8-1.817c1.151-1.371 2.2-3.143 2.2-4.99 0-2.33-1.65-3.976-4-3.976Z"/></svg>',
    key: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path d="M10 7.75a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"/><path fill-rule="evenodd" d="M8.85 2.75a4.35 4.35 0 0 0-4.35 4.35 3.401 3.401 0 0 0 2.5 3.28v3.435a2 2 0 0 0 .481 1.302l1.07 1.247a2 2 0 0 0 2.746.277l1.309-1.018a2.002 2.002 0 0 0 .376-2.776 2.004 2.004 0 0 0 .002-2.463 3.401 3.401 0 0 0 2.516-3.284 4.35 4.35 0 0 0-4.35-4.35h-2.3Zm2.835 11.69a.5.5 0 0 0-.042-.82l-.637-.397a.5.5 0 0 1 .041-.872l.582-.29a.5.5 0 0 0 .13-.802l-.613-.613a.5.5 0 0 1-.146-.353v-.793a.5.5 0 0 1 .5-.5h.6a1.9 1.9 0 0 0 1.9-1.9 2.85 2.85 0 0 0-2.85-2.85h-2.3a2.85 2.85 0 0 0-2.85 2.85c0 1.05.85 1.9 1.9 1.9h.1a.5.5 0 0 1 .5.5v4.315a.5.5 0 0 0 .12.325l1.07 1.248a.5.5 0 0 0 .686.07l1.31-1.019Z"/></svg>',
    door: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path d="M9.75 3c-1.243 0-2.25 1.007-2.25 2.25 0 .414.336.75.75.75s.75-.336.75-.75.336-.75.75-.75h3.5c.69 0 1.25.56 1.25 1.25v8.5c0 .69-.56 1.25-1.25 1.25h-3.5c-.414 0-.75-.336-.75-.75s-.336-.75-.75-.75-.75.336-.75.75c0 1.243 1.007 2.25 2.25 2.25h3.5c1.519 0 2.75-1.231 2.75-2.75v-8.5c0-1.519-1.231-2.75-2.75-2.75h-3.5Z"/><path d="M12.25 10.75c.414 0 .75-.336.75-.75s-.336-.75-.75-.75h-5.69l.97-.97c.293-.293.293-.767 0-1.06-.293-.293-.767-.293-1.06 0l-2.25 2.25c-.141.14-.22.331-.22.53s.079.39.22.53l2.25 2.25c.293.293.767.293 1.06 0 .293-.293.293-.767 0-1.06l-.97-.97h5.69Z"/></svg>',
    calendar: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path fill-rule="evenodd" d="M7.75 3.5a.75.75 0 0 0-1.5 0v.407a3.075 3.075 0 0 0-.702.252 3.75 3.75 0 0 0-1.64 1.639c-.226.444-.32.924-.365 1.47-.043.531-.043 1.187-.043 2v1.464c0 .813 0 1.469.043 2 .045.546.14 1.026.366 1.47a3.75 3.75 0 0 0 1.639 1.64c.444.226.924.32 1.47.365.531.043 1.187.043 2 .043h3.383c.323 0 .542 0 .735-.02a3.75 3.75 0 0 0 3.344-3.344c.02-.193.02-.412.02-.735v-2.883c0-.813 0-1.469-.043-2-.045-.546-.14-1.026-.366-1.47a3.75 3.75 0 0 0-1.639-1.64 3.076 3.076 0 0 0-.702-.251v-.407a.75.75 0 0 0-1.5 0v.259c-.373-.009-.794-.009-1.268-.009h-1.964c-.474 0-.895 0-1.268.009v-.259Zm-1.521 1.995c.197-.1.458-.17.912-.207.462-.037 1.057-.038 1.909-.038h1.9c.853 0 1.447 0 1.91.038.453.037.714.107.912.207.423.216.767.56.983.984.1.197.17.458.207.912.014.18.024.38.029.609h-9.982c.006-.228.015-.429.03-.61.036-.453.106-.714.206-.911a2.25 2.25 0 0 1 .984-.984Zm-1.229 4.005v1.2c0 .853 0 1.447.038 1.91.037.453.107.714.207.912.216.423.56.767.984.983.197.1.458.17.912.207.462.037 1.057.038 1.909.038h3.306c.385 0 .52-.001.626-.012a2.25 2.25 0 0 0 2.006-2.006c.011-.106.012-.241.012-.626v-2.606h-10Z"/></svg>',
    moon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path d="M9.636 3.191a.75.75 0 0 1 .104.787 5.5 5.5 0 0 0 6.28 7.625.75.75 0 0 1 .856 1.04 7.001 7.001 0 1 1-7.992-9.705.75.75 0 0 1 .752.253Zm-1.759 1.723a5.5 5.5 0 1 0 6.866 8.336 7 7 0 0 1-6.866-8.336Z"/></svg>',
    location: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" class="rf-icon"><path fill-rule="evenodd" d="M10 3a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm-2 3.5a2 2 0 1 1 4 0 2 2 0 0 1-4 0Z"/><path fill-rule="evenodd" d="M15.484 14.227a6.274 6.274 0 0 0-10.968 0l-.437.786a1.338 1.338 0 0 0 1.17 1.987h9.502a1.338 1.338 0 0 0 1.17-1.987l-.437-.786Zm-9.657.728a4.773 4.773 0 0 1 8.346 0l.302.545h-8.95l.302-.545Z"/></svg>'
  };

  // ─── i18n dictionary ─────────────────────────────────────────────────────────
  const I18N = {
    en: {
      reserveNow:      'Reserve Now',
      selectCheckIn:   'Select check-in date',
      selectCheckOut:  'Select check-out date',
      selectDate:      'Select a date',
      selectDates:     'Select one or more dates',
      selectCheckOutN: function(min, max) {
        var p = [];
        if (min > 1) p.push('min ' + min + ' nights');
        if (max)     p.push('max ' + max + ' nights');
        return p.length ? 'Select check-out (' + p.join(', ') + ')' : 'Select check-out date';
      },
      maxDatesSelected: function(n) { return 'Maximum ' + n + ' dates selected'; },
      moreDates: function(rem, max) { return rem + ' more date' + (rem !== 1 ? 's' : '') + ' available (max ' + max + ')'; },
      minMaxDates: function(min, max) {
        var p = [];
        if (min > 1) p.push('min ' + min + ' dates');
        if (max)     p.push('max ' + max + ' dates');
        return 'Select dates · ' + p.join(', ');
      },
      hideCalendar:    '▲ Hide Calendar',
      showCalendar:    '▼ Show Calendar',
      whatsIncluded:   "What's included",
      guests:          'Guests',
      adults:          'Adults',
      adultsAges:      'Ages 13+',
      children:        'Children',
      childrenAges:    'Ages 2–12',
      infants:         'Infants',
      infantsAges:     'Under 2',
      max:             'max',
      of:              'of',
      maxGuestsHint:   function(cur, max) { return cur + ' of ' + max + ' max guests selected'; },
      quantity:        'Quantity',
      units:           'Units',
      unitsHint:       function(maxQty) { return 'Number of units to book' + (maxQty ? ' · max ' + maxQty : ''); },
      priceBreakdown:  'Price breakdown',
      night:           'night',
      nights:          'nights',
      datesSelected:   function(n) { return n + ' date' + (n !== 1 ? 's' : '') + ' selected'; },
      discountApplied: 'Discount applied',
      total:           'Total',
      depositDueNow:   'Deposit due now',
      perNight:        '(per night)',
      checkingAvail:   'Checking availability\u2026',
      maxGuestsLabel:  'Max',
    },
    fr: {
      reserveNow:      'Réserver maintenant',
      selectCheckIn:   'Sélectionnez la date d\'arrivée',
      selectCheckOut:  'Sélectionnez la date de départ',
      selectDate:      'Sélectionnez une date',
      selectDates:     'Sélectionnez une ou plusieurs dates',
      selectCheckOutN: function(min, max) {
        var p = [];
        if (min > 1) p.push('min ' + min + ' nuits');
        if (max)     p.push('max ' + max + ' nuits');
        return p.length ? 'Départ (' + p.join(', ') + ')' : 'Sélectionnez la date de départ';
      },
      maxDatesSelected: function(n) { return 'Maximum ' + n + ' dates sélectionnées'; },
      moreDates: function(rem, max) { return rem + ' date' + (rem !== 1 ? 's' : '') + ' disponible(s) (max ' + max + ')'; },
      minMaxDates: function(min, max) {
        var p = [];
        if (min > 1) p.push('min ' + min + ' dates');
        if (max)     p.push('max ' + max + ' dates');
        return 'Sélectionner des dates · ' + p.join(', ');
      },
      hideCalendar:    '▲ Masquer le calendrier',
      showCalendar:    '▼ Afficher le calendrier',
      whatsIncluded:   'Ce qui est inclus',
      guests:          'Voyageurs',
      adults:          'Adultes',
      adultsAges:      '13 ans et +',
      children:        'Enfants',
      childrenAges:    '2–12 ans',
      infants:         'Bébés',
      infantsAges:     'Moins de 2 ans',
      max:             'max',
      of:              'sur',
      maxGuestsHint:   function(cur, max) { return cur + ' sur ' + max + ' voyageurs max'; },
      quantity:        'Quantité',
      units:           'Unités',
      unitsHint:       function(maxQty) { return 'Nombre d\'unités à réserver' + (maxQty ? ' · max ' + maxQty : ''); },
      priceBreakdown:  'Détail du prix',
      night:           'nuit',
      nights:          'nuits',
      datesSelected:   function(n) { return n + ' date' + (n !== 1 ? 's' : '') + ' sélectionnée(s)'; },
      discountApplied: 'Réduction appliquée',
      total:           'Total',
      depositDueNow:   'Acompte à payer maintenant',
      perNight:        '(par nuit)',
      checkingAvail:   'Vérification des disponibilités\u2026',
      maxGuestsLabel:  'Max',
    },
    de: {
      reserveNow:      'Jetzt reservieren',
      selectCheckIn:   'Anreisedatum wählen',
      selectCheckOut:  'Abreisedatum wählen',
      selectDate:      'Datum wählen',
      selectDates:     'Datum/Daten wählen',
      selectCheckOutN: function(min, max) {
        var p = [];
        if (min > 1) p.push('min ' + min + ' Nächte');
        if (max)     p.push('max ' + max + ' Nächte');
        return p.length ? 'Abreise (' + p.join(', ') + ')' : 'Abreisedatum wählen';
      },
      maxDatesSelected: function(n) { return 'Maximal ' + n + ' Daten ausgewählt'; },
      moreDates: function(rem, max) { return rem + ' weitere' + (rem !== 1 ? '' : 's') + ' Datum verfügbar (max ' + max + ')'; },
      minMaxDates: function(min, max) {
        var p = [];
        if (min > 1) p.push('min ' + min + ' Daten');
        if (max)     p.push('max ' + max + ' Daten');
        return 'Daten auswählen · ' + p.join(', ');
      },
      hideCalendar:    '▲ Kalender ausblenden',
      showCalendar:    '▼ Kalender anzeigen',
      whatsIncluded:   'Was ist inbegriffen',
      guests:          'Gäste',
      adults:          'Erwachsene',
      adultsAges:      'Ab 13 Jahren',
      children:        'Kinder',
      childrenAges:    '2–12 Jahre',
      infants:         'Kleinkinder',
      infantsAges:     'Unter 2 Jahren',
      max:             'max',
      of:              'von',
      maxGuestsHint:   function(cur, max) { return cur + ' von ' + max + ' max. Gästen ausgewählt'; },
      quantity:        'Anzahl',
      units:           'Einheiten',
      unitsHint:       function(maxQty) { return 'Anzahl der zu buchenden Einheiten' + (maxQty ? ' · max ' + maxQty : ''); },
      priceBreakdown:  'Preisaufschlüsselung',
      night:           'Nacht',
      nights:          'Nächte',
      datesSelected:   function(n) { return n + ' Datum' + (n !== 1 ? 'en' : '') + ' ausgewählt'; },
      discountApplied: 'Rabatt angewendet',
      total:           'Gesamt',
      depositDueNow:   'Anzahlung jetzt fällig',
      perNight:        '(pro Nacht)',
      checkingAvail:   'Verfügbarkeit wird geprüft\u2026',
      maxGuestsLabel:  'Max',
    },
    es: {
      reserveNow:      'Reservar ahora',
      selectCheckIn:   'Seleccione fecha de entrada',
      selectCheckOut:  'Seleccione fecha de salida',
      selectDate:      'Seleccione una fecha',
      selectDates:     'Seleccione una o más fechas',
      selectCheckOutN: function(min, max) {
        var p = [];
        if (min > 1) p.push('mín ' + min + ' noches');
        if (max)     p.push('máx ' + max + ' noches');
        return p.length ? 'Salida (' + p.join(', ') + ')' : 'Seleccione fecha de salida';
      },
      maxDatesSelected: function(n) { return 'Máximo ' + n + ' fechas seleccionadas'; },
      moreDates: function(rem, max) { return rem + ' fecha' + (rem !== 1 ? 's' : '') + ' disponible(s) (máx ' + max + ')'; },
      minMaxDates: function(min, max) {
        var p = [];
        if (min > 1) p.push('mín ' + min + ' fechas');
        if (max)     p.push('máx ' + max + ' fechas');
        return 'Seleccionar fechas · ' + p.join(', ');
      },
      hideCalendar:    '▲ Ocultar calendario',
      showCalendar:    '▼ Mostrar calendario',
      whatsIncluded:   'Qué está incluido',
      guests:          'Huéspedes',
      adults:          'Adultos',
      adultsAges:      'Mayores de 13',
      children:        'Niños',
      childrenAges:    '2–12 años',
      infants:         'Bebés',
      infantsAges:     'Menores de 2',
      max:             'máx',
      of:              'de',
      maxGuestsHint:   function(cur, max) { return cur + ' de ' + max + ' huéspedes máx seleccionados'; },
      quantity:        'Cantidad',
      units:           'Unidades',
      unitsHint:       function(maxQty) { return 'Número de unidades a reservar' + (maxQty ? ' · máx ' + maxQty : ''); },
      priceBreakdown:  'Desglose de precio',
      night:           'noche',
      nights:          'noches',
      datesSelected:   function(n) { return n + ' fecha' + (n !== 1 ? 's' : '') + ' seleccionada(s)'; },
      discountApplied: 'Descuento aplicado',
      total:           'Total',
      depositDueNow:   'Depósito a pagar ahora',
      perNight:        '(por noche)',
      checkingAvail:   'Comprobando disponibilidad\u2026',
      maxGuestsLabel:  'Máx',
    },
    ar: {
      reserveNow:      'احجز الآن',
      selectCheckIn:   'اختر تاريخ الوصول',
      selectCheckOut:  'اختر تاريخ المغادرة',
      selectDate:      'اختر تاريخاً',
      selectDates:     'اختر تاريخاً أو أكثر',
      selectCheckOutN: function(min, max) {
        var p = [];
        if (min > 1) p.push('الحد الأدنى ' + min + ' ليالٍ');
        if (max)     p.push('الحد الأقصى ' + max + ' ليالٍ');
        return p.length ? 'المغادرة (' + p.join('، ') + ')' : 'اختر تاريخ المغادرة';
      },
      maxDatesSelected: function(n) { return 'تم اختيار الحد الأقصى ' + n + ' تواريخ'; },
      moreDates: function(rem, max) { return rem + ' تاريخ متاح (الحد الأقصى ' + max + ')'; },
      minMaxDates: function(min, max) {
        var p = [];
        if (min > 1) p.push('الحد الأدنى ' + min + ' تواريخ');
        if (max)     p.push('الحد الأقصى ' + max + ' تواريخ');
        return 'اختر تواريخ · ' + p.join('، ');
      },
      hideCalendar:    '▲ إخفاء التقويم',
      showCalendar:    '▼ إظهار التقويم',
      whatsIncluded:   'ما هو مشمول',
      guests:          'الضيوف',
      adults:          'البالغون',
      adultsAges:      '13 سنة فأكثر',
      children:        'الأطفال',
      childrenAges:    '2–12 سنة',
      infants:         'الرضّع',
      infantsAges:     'أقل من سنتين',
      max:             'الحد الأقصى',
      of:              'من',
      maxGuestsHint:   function(cur, max) { return cur + ' من ' + max + ' ضيوف كحد أقصى'; },
      quantity:        'الكمية',
      units:           'وحدات',
      unitsHint:       function(maxQty) { return 'عدد الوحدات للحجز' + (maxQty ? ' · الحد الأقصى ' + maxQty : ''); },
      priceBreakdown:  'تفاصيل السعر',
      night:           'ليلة',
      nights:          'ليالٍ',
      datesSelected:   function(n) { return n + ' تاريخ محدد'; },
      discountApplied: 'تم تطبيق الخصم',
      total:           'الإجمالي',
      depositDueNow:   'الوديعة المستحقة الآن',
      perNight:        '(في الليلة)',
      checkingAvail:   'جارٍ التحقق من التوفر\u2026',
      maxGuestsLabel:  'الحد الأقصى',
    },
  };

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
    container.dataset.buttonText            = embed.dataset.buttonText            || 'Reserve Now';
    container.dataset.moneyWithCurrencyFormat = embed.dataset.moneyWithCurrencyFormat || embed.dataset.moneyFormat || '{{amount}}';
    var hasAppointment = embed.dataset.hasAppointment === 'true';
    container.innerHTML = hasAppointment
      ? '<div class="rentfic-loading"><div class="rentfic-spinner"></div></div>'
      : '<div class="rentfic-loading">Checking availability…</div>';

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
      this.moneyFmt             = container.dataset.moneyFormat             || '{{amount}}';
      this.moneyWithCurrencyFmt = container.dataset.moneyWithCurrencyFormat || this.moneyFmt;
      this.primaryColor         = container.dataset.primaryColor             || '#008060';
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
        if (!data.found) {
          this.container.innerHTML = '<div class="rentfic-loading">Checking availability…</div>';
          return;
        }
        this.apartment    = data.apartment;
        this.shopSettings = data.shopSettings || {};
        this.calOpen      = (this.shopSettings.displayCalendar || 'always_open') !== 'default';

        // Detect locale and pick translation bundle
        var setting = this.shopSettings.translate || 'automatic';
        var lang;
        if (setting === 'automatic') {
          lang = (document.documentElement.lang || navigator.language || 'en').slice(0, 2).toLowerCase();
        } else {
          lang = setting;
        }
        this.t = I18N[lang] || I18N.en;

        // Build a fast lookup: { "YYYY-MM-DD": { value, type } }
        this.discountedDateMap = {};
        (this.apartment.discountedDates || []).forEach(function(group) {
          (group.dates || []).forEach(function(d) {
            this.discountedDateMap[d] = { value: group.value, type: group.type };
          }, this);
        }, this);

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

    // Visual selectability - extends _isSelectable with state-aware min/max day constraints
    _isCalendarSelectable(date) {
      if (!this._isSelectable(date)) return false;
      const { bookingType, minDays, maxDays } = this.apartment;

      // Range: once start is picked but end isn't, constrain the valid end-date window.
      // Disabled dates inside the window are skipped - they don't count toward min/max.
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
          // No selection yet, or both dates already set - start fresh
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
      if      (bookingType === 'range'    && !this.startDate) hint = this.t.selectCheckIn;
      else if (bookingType === 'range'    && !this.endDate) {
        hint = this.t.selectCheckOutN(minDays, maxDays);
      }
      else if (bookingType === 'single'   && !this.startDate) hint = this.t.selectDate;
      else if (bookingType === 'multiple') {
        const remaining = maxDays ? maxDays - this.selectedDates.length : null;
        const parts = [];
        if (minDays > 1) parts.push('min ' + minDays);
        if (maxDays)     parts.push('max ' + maxDays);
        if (remaining !== null && remaining === 0) hint = this.t.maxDatesSelected(maxDays);
        else if (remaining !== null && remaining > 0 && this.selectedDates.length > 0)
          hint = this.t.moreDates(remaining, maxDays);
        else hint = parts.length ? this.t.minMaxDates(minDays, maxDays) : this.t.selectDates;
      }

      const calDefault  = (this.shopSettings.displayCalendar || 'always_open') === 'default';
      const showCal     = !calDefault || this.calOpen;

      this.container.innerHTML = `
        <div class="rentfic-widget" style="--rf-primary:${this.primaryColor}">
          ${this._renderGallery()}
          ${this._renderHeader(pricePerNight)}
          ${this._renderInfoStrip()}
          ${this._renderAmenities()}
          ${this._renderLocation()}
          ${calDefault ? `<button class="rentfic-toggle-cal" id="rf-toggle-cal">${this.calOpen ? this.t.hideCalendar : this.t.showCalendar}</button>` : ''}
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
      const lt     = this.apartment.listingType || 'property';

      // Dynamic price unit label based on listing type
      const priceUnit = (lt === 'equipment' || lt === 'vehicle') ? 'day'
        : lt === 'experience' ? 'session'
        : (lt === 'clothing' || lt === 'other') ? 'booking'
        : 'night'; // property default

      // Duration label in the summary pill
      const unitLabel = priceUnit === 'night' ? ('night' + (nights !== 1 ? 's' : ''))
        : priceUnit === 'day' ? ('day' + (nights !== 1 ? 's' : ''))
        : priceUnit === 'session' ? ('session' + (nights !== 1 ? 's' : ''))
        : ('booking' + (nights !== 1 ? 's' : ''));

      let priceHtml = '';
      if (fp !== 'disabled') {
        const showFrom = !hasSel && fp !== 'automatic';
        const perLabel = fp === 'minimum_per_day' ? '/ day' : ('/ ' + priceUnit);
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
              <span class="rf-total-nights">(${nights} ${unitLabel})</span>
            </div>` : ''}
        </div>
      `;
    }

    _fmtPriceWithCurrency(amount) {
      return this.moneyWithCurrencyFmt.replace(/\{\{amount[^}]*\}\}/g, parseFloat(amount || 0).toFixed(2));
    }

    // Update the Shopify theme's own price display using the shop's money_with_currency_format
    _syncPagePrice(price) {
      const formatted = this._fmtPriceWithCurrency(price);
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
          el.textContent = formatted;
        });
      }
    }

    _renderInfoStrip() {
      const { bedrooms, bathrooms, maxGuests, checkInTime, checkOutTime, minDays, city, country, listingType } = this.apartment;
      const lt    = listingType || 'property';
      const isProperty = lt === 'property';
      const items = [];
      // Bedrooms/bathrooms only meaningful for properties
      if (isProperty && bedrooms)    items.push(`${ICONS.bed} ${bedrooms} bed${bedrooms !== 1 ? 's' : ''}`);
      if (isProperty && bathrooms)   items.push(`${ICONS.bath} ${bathrooms} bath${bathrooms !== 1 ? 's' : ''}`);
      if (maxGuests) {
        const guestLabel = (lt === 'vehicle') ? 'seats' : 'guests';
        items.push(`${ICONS.person} Max ${maxGuests} ${guestLabel}`);
      }
      // Time fields dynamically labeled
      const timeLabelIn = isProperty ? 'Check-in' : 'Pickup';
      const timeLabelOut = isProperty ? 'Check-out' : 'Return';
      if (checkInTime)  items.push(`${ICONS.key} ${timeLabelIn} ${this._fmtTime(checkInTime)}`);
      if (checkOutTime) items.push(`${ICONS.door} ${timeLabelOut} ${this._fmtTime(checkOutTime)}`);
      // Duration label adapts to type
      const unitWord = (lt === 'equipment' || lt === 'vehicle') ? 'days'
        : lt === 'experience' ? 'sessions'
        : (lt === 'clothing' || lt === 'other') ? 'bookings' : 'nights';
      if (minDays > 1) items.push(this.apartment.bookingType === 'multiple'
        ? `${ICONS.calendar} Min ${minDays} dates`
        : `${ICONS.moon} Min ${minDays} ${unitWord}`);
      if (city || country) items.push(`${ICONS.location} ${[city, country].filter(Boolean).join(', ')}`);
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
      return `
        <div class="rf-amenities-section">
          <div class="rf-amenities-title">${this.t.whatsIncluded}</div>
          <div class="rf-amenities-list">
            ${list.map(a => `
              <span class="rf-amenity-tag">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" stroke-width="1.8"
                    stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                ${a}
              </span>
            `).join('')}
          </div>
        </div>
      `;
    }

    _renderLocation() {
      const { address, city, country } = this.apartment;
      if (!address && !city && !country) return '';
      const locationStr = [address, city, country].filter(Boolean).join(', ');
      const mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(locationStr);
      return `
        <div class="rf-location">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            <circle cx="12" cy="9" r="2.5"/>
          </svg>
          <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="rf-location-link">
            ${locationStr}
          </a>
        </div>
      `;
    }

    _renderGallery() {
      const images = this.apartment.images || [];
      if (!images.length) return '';
      return `
        <div class="rf-gallery">
          ${images.map((url, i) => `
            <div class="rf-gallery-item${i === 0 ? ' rf-gallery-cover' : ''}">
              <img
                src="${url}"
                alt="Apartment photo ${i + 1}"
                class="rf-gallery-img"
                loading="lazy"
                onclick="this.closest('.rf-gallery-item').classList.toggle('rf-gallery-zoom')"
              />
            </div>
          `).join('')}
        </div>
      `;
    }

    _renderGuestSelector() {
      const { listingType, maxAdults, maxChildren, maxInfants, maxGuests } = this.apartment;
      const lt = listingType || 'property';
      
      if (lt !== 'property' && lt !== 'experience' && lt !== 'vehicle') return '';

      const totalG = this._totalGuests();

      if (lt === 'vehicle') {
        const val = this.guests.adults; // reuse 'adults' state to track passengers
        const atMin = val <= 1;
        const atMax = maxGuests != null && val >= maxGuests;
        
        return `
          <div class="rf-guest-section">
            <div class="rf-section-title">Passengers</div>
            <div class="rf-guest-row">
              <div class="rf-guest-label">
                <span class="rf-guest-name">Seats</span>
                <span class="rf-guest-sub">${maxGuests ? `max ${maxGuests}` : 'Number of passengers'}</span>
              </div>
              <div class="rf-stepper">
                <button class="rf-step-btn" data-guest="adults" data-dir="-1" ${atMin ? 'disabled' : ''}>−</button>
                <span class="rf-step-val">${val}</span>
                <button class="rf-step-btn" data-guest="adults" data-dir="1" ${atMax ? 'disabled' : ''}>+</button>
              </div>
            </div>
          </div>
        `;
      }

      const rows = [
        { key: 'adults',   label: this.t.adults,   sub: this.t.adultsAges,   min: 1, max: maxAdults },
        { key: 'children', label: this.t.children, sub: this.t.childrenAges, min: 0, max: maxChildren },
        { key: 'infants',  label: this.t.infants,  sub: this.t.infantsAges,  min: 0, max: maxInfants },
      ];

      return `
        <div class="rf-guest-section">
          <div class="rf-section-title">${this.t.guests}</div>
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
          ${maxGuests ? `<div class="rf-guest-max-hint">${this.t.maxGuestsHint(totalG, maxGuests)}</div>` : ''}
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
          <div class="rf-section-title">${this.t.quantity}</div>
          <div class="rf-qty-row">
            <div class="rf-guest-label">
              <span class="rf-guest-name">${this.t.units}</span>
              <span class="rf-guest-sub">${this.t.unitsHint(stockQuantity ? maxQty : null)}</span>
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

    _isDiscounted(date) {
      return !!(this.discountedDateMap && this.discountedDateMap[this._toStr(date)]);
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

        const isDisc = inBounds && this._isDiscounted(date);
        if (isDisc) cls += ' rf-cell--discounted';

        const discData = isDisc ? this.discountedDateMap[this._toStr(date)] : null;
        const titleAttr = discData
          ? ` title="${discData.type === 'percent' ? discData.value + '% off' : '$' + discData.value + ' off'}"`
          : '';

        html += `<div class="${cls}" data-date="${this._toStr(date)}"${titleAttr}>${d}</div>`;
      }

      return html + '</div></div>';
    }

    _renderSummary(nights, total, deposit) {
      const { bookingType, pricePerNight, listingType } = this.apartment;
      const lt     = listingType || 'property';
      const base   = this.quantity * nights * (pricePerNight || 0);
      const fees   = this._calcFees(nights);
      const disc   = this._calcDiscount(base, nights);

      // Dynamic unit labels based on rental category
      const unitSingular = (lt === 'equipment' || lt === 'vehicle') ? 'day'
        : lt === 'other' ? 'booking'
        : 'night';
      const unitPlural = (lt === 'equipment' || lt === 'vehicle') ? 'days'
        : lt === 'other' ? 'bookings'
        : 'nights';
      const perUnitLabel = (lt === 'equipment' || lt === 'vehicle') ? '(per day)'
        : lt === 'other' ? '(per booking)'
        : '(per night)';
      const unitLabel = nights !== 1 ? unitPlural : unitSingular;

      let dateLabel = '';
      if      (bookingType === 'range'    && this.startDate && this.endDate) dateLabel = `${this._toStr(this.startDate)} &rarr; ${this._toStr(this.endDate)}`;
      else if (bookingType === 'single'   && this.startDate)                 dateLabel = this._toStr(this.startDate);
      else if (bookingType === 'multiple')                                   dateLabel = this.t.datesSelected(nights);

      return `
        <div class="rentfic-summary">
          <div class="rf-section-title" style="margin-bottom:10px">${this.t.priceBreakdown}</div>
          ${dateLabel ? `<div class="rf-sum-row rf-sum-dates"><span>${dateLabel}</span></div>` : ''}
          <div class="rf-sum-row">
            <span>
              ${this.quantity > 1 ? `${this.quantity} ${this.t.units} × ` : ''}${nights} ${unitLabel} × ${this._fmtPrice(pricePerNight)}
            </span>
            <span>${this._fmtPrice(base)}</span>
          </div>
          ${fees.map(fee => `
            <div class="rf-sum-row rf-fee-row">
              <span>${fee.name}${fee.applyPer === 'night' ? ` <em>${perUnitLabel}</em>` : ''}</span>
              <span>${this._fmtPrice(fee.computed)}</span>
            </div>
          `).join('')}
          ${disc > 0 ? `
            <div class="rf-sum-row rf-discount-row">
              <span>${this.t.discountApplied}</span>
              <span>−${this._fmtPrice(disc)}</span>
            </div>
          ` : ''}
          <div class="rf-sum-row rf-total">
            <strong>${this.t.total}</strong><strong>${this._fmtPrice(total)}</strong>
          </div>
          ${deposit !== null ? `
            <div class="rf-sum-row rf-deposit">
              <span>${this.t.depositDueNow}</span>
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
        // 1. Create booking - server recalculates total and updates variant price
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

        const timeLabelIn = (this.apartment.listingType === 'property') ? 'Check-in' : 'Pickup';
        const timeLabelOut = (this.apartment.listingType === 'property') ? 'Check-out' : 'Return';
        const durationLabel = (this.apartment.listingType === 'property') ? 'Nights' : 'Days';
        
        const properties = {
          [timeLabelIn]:  startDate,
          [timeLabelOut]: endDate,
          [durationLabel]: String(nights),
          'Units':        String(this.quantity),
          'Total Price':  this._fmtPrice(bData.finalTotal),
          '_booking_id':  bData.bookingId,
        };

        if (this.apartment.listingType === 'vehicle') {
          properties['Passengers'] = String(this.guests.adults);
        } else if (this.apartment.listingType === 'property' || this.apartment.listingType === 'experience') {
          properties['Adults'] = String(this.guests.adults);
          properties['Children'] = String(this.guests.children);
          properties['Infants'] = String(this.guests.infants);
          properties['Total Guests'] = String(this._totalGuests());
        }
        if (bookingDates) properties['Dates'] = bookingDates.join(', ');
        if (bData.isDeposit) {
          properties['Deposit'] = this._fmtPrice(bData.depositCharged);
        }

        // 2. Add main booking to cart (variant price = full total)
        const cartRes = await fetch('/cart/add.js', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: variantId, quantity: 1, properties }),
        });

        if (!cartRes.ok) {
          this._msg('Booking saved but cart update failed. Please refresh.', 'warning');
          return;
        }

        // 2b. Add deposit as a separate cart item so it's charged at checkout
        if (bData.isDeposit && bData.depositVariantId) {
          await fetch('/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: bData.depositVariantId,
              quantity: 1,
              properties: {
                'Booking Reference': bData.bookingId,
                'Note': 'Refundable security deposit',
                '_booking_id': bData.bookingId,
              },
            }),
          }).catch(() => {});
        }

        // 3. Reset both variant prices (fire-and-forget)
        fetch('/apps/rentfic/price-reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            productId: this.productId,
            price: bData.resetPrice,
            ...(bData.depositVariantGid ? { depositVariantGid: bData.depositVariantGid } : {}),
          }),
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
