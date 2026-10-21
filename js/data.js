/* بيانات تجريبية للنموذج الأولي – تُستبدل بقاعدة البيانات المحلية */
(function () {
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rnd = mulberry32(20260927);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const between = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  const pad = (n, l = 2) => String(n).padStart(l, '0');

  const NOW = new Date();
  const DAY_START = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  const MONTH_START = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
  const minutesAgo = (m) => new Date(NOW.getTime() - m * 60000);
  const daysAgoAt = (d, h, m) => {
    const x = new Date(DAY_START);
    x.setDate(x.getDate() - d);
    x.setHours(h, m, 0, 0);
    return x;
  };

  const UNIT = 'الكتيبة 45 مشاة';
  const RANKS = ['جندي', 'عريف', 'رقيب', 'رقيب أول', 'مساعد', 'مساعد أول'];
  const RANK_WEIGHTED = ['جندي', 'جندي', 'جندي', 'جندي', 'جندي', 'جندي', 'عريف', 'عريف', 'رقيب', 'رقيب', 'رقيب أول', 'مساعد', 'مساعد أول'];
  const COMPANIES = ['سرية القيادة', 'السرية الأولى', 'السرية الثانية', 'السرية الثالثة', 'السرية الرابعة'];
  const SPECIALTIES = ['مشاة', 'سائق', 'إشارة', 'حراسة', 'طباخ', 'كاتب', 'فني صيانة', 'مسعف'];
  const PREV_UNITS = ['مركز تدريب المشاة', 'الكتيبة 12 مشاة', 'اللواء الثالث مشاة', 'مركز تدريب الإشارة', ''];
  const ADDRESSES = ['القاهرة – شبرا', 'الجيزة – فيصل', 'القليوبية – بنها', 'الشرقية – الزقازيق', 'الدقهلية – المنصورة', 'المنيا – ملوي', 'أسيوط – ديروط', 'الإسكندرية – العجمي', 'سوهاج – طهطا', 'البحيرة – دمنهور', 'الغربية – طنطا', 'بني سويف – الواسطى'];
  const DESCRIPTIONS = ['قمحي البشرة – بدون علامات مميزة', 'أسمر البشرة – أثر جرح بالجبهة', 'قمحي البشرة – شامة بالخد الأيمن', 'أبيض البشرة – بدون علامات مميزة', 'أسمر البشرة – بدون علامات مميزة'];

  /* الأسباب الثابتة للخروج (23 سببًا) – تُستبدل بالقائمة المعتمدة في الوحدة */
  const EXIT_REASONS = [
    'إجازة اعتيادية', 'إجازة عارضة', 'إجازة مرضية', 'إجازة ميدانية', 'مأمورية رسمية',
    'مأمورية خارجية', 'علاج بالمستشفى', 'كشف طبي', 'ظروف عائلية', 'حالة وفاة',
    'حالة زواج', 'مراجعة جهة حكومية', 'مراجعة منطقة التجنيد', 'استخراج مستندات', 'أداء امتحانات',
    'فرقة تدريبية', 'نقل إلى وحدة أخرى', 'مأمورية نقل مهمات', 'تصريح مبيت', 'خروج ساعات',
    'حضور جلسة محكمة', 'استدعاء من القيادة', 'إنهاء الخدمة',
  ];

  const FITNESS_TYPES = ['جري 3 كم', 'ضغط', 'عقلة', 'بطن', 'اختبار اللياقة الشامل'];

  const FIRST = ['محمد', 'أحمد', 'محمود', 'عمر', 'يوسف', 'كريم', 'مصطفى', 'إسلام', 'عبد الرحمن', 'حسام', 'أيمن', 'شريف', 'علي', 'خالد', 'إبراهيم', 'حسن', 'طارق', 'ياسر', 'مينا', 'عمرو', 'سيد', 'وليد', 'هاني', 'رامي'];
  const MID = ['أحمد', 'محمود', 'حسن', 'علي', 'سعيد', 'عادل', 'أشرف', 'جمال', 'طارق', 'ياسر', 'رضا', 'ناصر', 'فتحي', 'رمضان', 'صبري', 'عبد الله', 'مصطفى', 'إبراهيم'];
  const LAST = ['عبد الله', 'السيد', 'إبراهيم', 'عبد الرحمن', 'عثمان', 'سالم', 'منصور', 'عبد العزيز', 'حسين', 'فؤاد', 'شعبان', 'عبد الحميد', 'عبد الفتاح', 'فهمي', 'عبد الغني', 'الشافعي', 'النجار', 'حجازي', 'البدري', 'زكي'];

  const soldiers = [];
  const usedNames = new Set();
  for (let i = 0; i < 64; i++) {
    let name;
    do {
      const parts = [pick(FIRST), pick(MID), pick(MID), pick(LAST)];
      name = new Set(parts).size === 4 ? parts.join(' ') : '';
    } while (!name || usedNames.has(name));
    usedNames.add(name);

    const by = between(2001, 2006);
    const bm = between(1, 12);
    const bd = between(1, 28);
    const gov = pick(['01', '02', '12', '13', '14', '16', '19', '21', '24', '25', '26']);
    const nationalId = `3${String(by).slice(2)}${pad(bm)}${pad(bd)}${gov}${pad(between(0, 9999), 4)}${between(1, 9)}`;
    const ey = between(2024, 2026);
    const em = ey === NOW.getFullYear() ? between(0, Math.max(0, NOW.getMonth() - 1)) : between(0, 11);
    const enlistDate = new Date(ey, em, between(1, 28));
    const permitDate = new Date(enlistDate.getTime() + between(10, 40) * 86400000);

    soldiers.push({
      id: i + 1,
      name,
      militaryNo: `${ey}${pad(between(10000, 99999), 5)}`,
      nationalId,
      rank: pick(RANK_WEIGHTED),
      description: pick(DESCRIPTIONS),
      company: pick(COMPANIES),
      unit: UNIT,
      prevUnit: pick(PREV_UNITS),
      specialty: pick(SPECIALTIES),
      enlistDate,
      permitNo: `${between(1000, 9999)}/${ey}`,
      permitDate,
      address: pick(ADDRESSES),
      phone: `01${pick(['0', '1', '2', '5'])}${pad(between(0, 99999999), 8)}`,
      phone2: rnd() < 0.45 ? `01${pick(['0', '1', '2', '5'])}${pad(between(0, 99999999), 8)}` : '',
      age: NOW.getFullYear() - by,
      height: between(164, 188),
      weight: between(60, 92),
      status: 'in',
      photo: null,
      idPhoto: null,
      createdAt: enlistDate,
    });
  }
  soldiers[soldiers.length - 1].createdAt = minutesAgo(95);
  soldiers[soldiers.length - 2].createdAt = minutesAgo(240);

  /* التصاريح (خروج / دخول) */
  const permits = [];
  let permitSeq = 1480;
  const newPermitNo = () => `${++permitSeq}`;

  for (let k = 0; k < 40; k++) {
    const s = pick(soldiers);
    const d = between(2, 25);
    const exitAt = daysAgoAt(d, between(7, 15), pick([0, 15, 30, 45]));
    const reason = pick(EXIT_REASONS.slice(0, 20));
    const hours = reason === 'خروج ساعات' ? between(2, 6) : between(1, 4) * 24;
    const expectedReturn = new Date(exitAt.getTime() + hours * 3600000);
    const returnedAt = new Date(expectedReturn.getTime() - between(-90, 120) * 60000);
    if (returnedAt > NOW) continue;
    permits.push({ id: permits.length + 1, no: newPermitNo(), soldierId: s.id, reason, exitAt, expectedReturn, returnedAt, notes: '', entryNotes: '' });
  }

  const outPlan = [
    [3, 'إجازة اعتيادية', minutesAgo(60 * 26), 48],
    [8, 'مأمورية رسمية', minutesAgo(180), 6],
    [14, 'كشف طبي', minutesAgo(75), 4],
    [21, 'إجازة عارضة', minutesAgo(60 * 20), 30],
    [27, 'خروج ساعات', minutesAgo(40), 3],
    [33, 'مراجعة منطقة التجنيد', minutesAgo(150), 8],
    [40, 'ظروف عائلية', minutesAgo(60 * 30), 24],
    [52, 'فرقة تدريبية', minutesAgo(60 * 50), 72],
  ];
  outPlan.forEach(([sid, reason, exitAt, hrs]) => {
    const s = soldiers[sid - 1];
    s.status = 'out';
    permits.push({ id: permits.length + 1, no: newPermitNo(), soldierId: s.id, reason, exitAt, expectedReturn: new Date(exitAt.getTime() + hrs * 3600000), returnedAt: null, notes: '', entryNotes: '' });
  });

  [[5, 'إجازة اعتيادية', 60 * 49, 30], [17, 'كشف طبي', 320, 25], [44, 'خروج ساعات', 290, 12]].forEach(([sid, reason, outMin, backMin]) => {
    const exitAt = minutesAgo(outMin);
    permits.push({ id: permits.length + 1, no: newPermitNo(), soldierId: sid, reason, exitAt, expectedReturn: new Date(exitAt.getTime() + 4 * 3600000), returnedAt: minutesAgo(backMin), notes: '', entryNotes: '' });
  });

  /* عمليات الكانتين */
  const canteen = [];
  const daysInMonthSoFar = Math.floor((DAY_START - MONTH_START) / 86400000);
  for (let k = 0; k < 150; k++) {
    const d = between(1, Math.max(1, daysInMonthSoFar));
    canteen.push({ id: canteen.length + 1, soldierId: pick(soldiers).id, amount: pick([15, 20, 25, 30, 35, 40, 50, 60, 75]), at: daysAgoAt(d, between(8, 21), between(0, 59)) });
  }
  [12, 26, 38, 55, 70, 88, 110, 135, 170, 205, 260, 310].forEach((m) => {
    canteen.push({ id: canteen.length + 1, soldierId: pick(soldiers).id, amount: pick([15, 20, 25, 30, 40, 50]), at: minutesAgo(m) });
  });

  /* سجلات اللياقة */
  const fitness = [];
  const fitResult = (type) => {
    switch (type) {
      case 'جري 3 كم': return `${between(11, 17)}:${pad(between(0, 59))} دقيقة`;
      case 'ضغط': return `${between(25, 60)} مرة`;
      case 'عقلة': return `${between(4, 18)} مرة`;
      case 'بطن': return `${between(30, 70)} مرة`;
      default: return pick(['ممتاز', 'جيد جدًا', 'جيد', 'مقبول']);
    }
  };
  soldiers.forEach((s) => {
    const n = between(0, 4);
    for (let k = 0; k < n; k++) {
      const type = pick(FITNESS_TYPES);
      fitness.push({ id: fitness.length + 1, soldierId: s.id, date: daysAgoAt(between(3, 150), 7, 0), type, result: fitResult(type), notes: pick(['', '', 'أداء منتظم', 'يحتاج إلى تحسين', 'مستوى جيد']) });
    }
  });

  const DB = window.DB = {
    NOW, MONTH_START, UNIT, RANKS, COMPANIES, SPECIALTIES, EXIT_REASONS, FITNESS_TYPES,
    soldiers, permits, canteen, fitness,
    extraReasons: ['زيارة أسرية معتمدة'],
    nextPermitNo: newPermitNo,
    settings: {
      unitName: UNIT,
      parentFormation: 'اللواء الثالث مشاة',
      admin: { name: 'رقيب أول / محمد عبد الله', username: 'admin', password: '1234' },
      printer: 'طابعة النظام الافتراضية',
      paper: 'A4',
      margins: 'عادية',
      showLogo: true,
      logo: null,
    },
  };

  /* الحفظ المحلي على الجهاز */
  const STORE_KEY = 'unit-system-v1';
  const DATE_FIELDS = {
    soldiers: ['enlistDate', 'permitDate', 'createdAt'],
    permits: ['exitAt', 'expectedReturn', 'returnedAt'],
    canteen: ['at'],
    fitness: ['date'],
  };

  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && saved.v === 1) {
      Object.entries(DATE_FIELDS).forEach(([table, fields]) => {
        DB[table] = saved[table].map((row) => {
          fields.forEach((f) => { row[f] = row[f] ? new Date(row[f]) : null; });
          return row;
        });
      });
      DB.extraReasons = saved.extraReasons;
      Object.assign(DB.settings, saved.settings);
      permitSeq = Math.max(permitSeq, ...DB.permits.map((p) => Number(p.no) || 0));
    }
  } catch (e) {
    localStorage.removeItem(STORE_KEY);
  }

  window.saveDB = function saveDB() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({
        v: 1, soldiers: DB.soldiers, permits: DB.permits, canteen: DB.canteen, fitness: DB.fitness,
        extraReasons: DB.extraReasons, settings: DB.settings,
      }));
      return true;
    } catch (e) {
      if (typeof toast === 'function') toast('تعذر حفظ البيانات على الجهاز – مساحة التخزين ممتلئة', 'error');
      return false;
    }
  };
})();
