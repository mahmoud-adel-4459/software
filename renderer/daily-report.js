'use strict';
(function () {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cash = cents => `${(Number(cents) / 100).toFixed(2)} ج.م`;

  function svgDonut(segments, size = 140) {
    const total = segments.reduce((s, x) => s + x.value, 0) || 1;
    let angle = -90;
    const r = size / 2 - 8;
    const cx = size / 2;
    const cy = size / 2;
    const paths = segments.map(seg => {
      const sweep = (seg.value / total) * 360;
      const start = angle;
      angle += sweep;
      const a0 = (start * Math.PI) / 180;
      const a1 = ((start + sweep) * Math.PI) / 180;
      const x0 = cx + r * Math.cos(a0);
      const y0 = cy + r * Math.sin(a0);
      const x1 = cx + r * Math.cos(a1);
      const y1 = cy + r * Math.sin(a1);
      const large = sweep > 180 ? 1 : 0;
      return `<path d="M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1} Z" fill="${esc(seg.color)}" />`;
    }).join('');
    const legend = segments.map(s => `<span class="donut-legend-item"><i style="background:${esc(s.color)}"></i>${esc(s.label)} (${s.value})</span>`).join('');
    return `<div class="chart-donut" role="img" aria-label="توزيع ${esc(segments.map(s => s.label).join('، '))}"><svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${paths}<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="var(--surface,#fff)"/></svg><div class="donut-legend">${legend}</div></div>`;
  }

  function svgBars(items, { title, color = '#244b46', height = 160, maxItems = 14 }) {
    const data = items.slice(0, maxItems);
    const max = Math.max(1, ...data.map(d => d.value));
    const w = Math.max(320, data.length * 36);
    const barW = Math.min(28, (w - 40) / Math.max(1, data.length) - 6);
    const bars = data.map((d, i) => {
      const h = Math.round((d.value / max) * (height - 36));
      const x = 24 + i * (barW + 8);
      const y = height - 24 - h;
      return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${color}" opacity="0.9"/><text x="${x + barW / 2}" y="${height - 6}" text-anchor="middle" font-size="9" fill="var(--text-2,#555)">${esc(d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label)}</text><text x="${x + barW / 2}" y="${y - 4}" text-anchor="middle" font-size="10" font-weight="600">${d.value}</text>`;
    }).join('');
    return `<figure class="chart-bars"><figcaption>${esc(title)}</figcaption><svg width="100%" height="${height}" viewBox="0 0 ${w} ${height}" preserveAspectRatio="xMidYMid meet">${bars}</svg></figure>`;
  }

  function svgGateHours(byHour) {
    const active = byHour.filter(h => h.entries || h.exits);
    const data = active.length ? active : byHour.filter(h => h.hour >= 6 && h.hour <= 22);
    const max = Math.max(1, ...data.map(h => h.entries + h.exits));
    const height = 180;
    const w = Math.max(400, data.length * 28);
    const groupW = 22;
    const bars = data.map((h, i) => {
      const x = 20 + i * 26;
      const eh = Math.round((h.entries / max) * (height - 40));
      const xh = Math.round((h.exits / max) * (height - 40));
      return `<rect x="${x}" y="${height - 20 - eh}" width="9" height="${eh}" fill="#2d6a4f"/><rect x="${x + 11}" y="${height - 20 - xh}" width="9" height="${xh}" fill="#bc4749"/><text x="${x + 10}" y="${height - 4}" text-anchor="middle" font-size="8">${h.hour}</text>`;
    }).join('');
    return `<figure class="chart-bars chart-gate-hours"><figcaption>حركات البوابة بالساعة (أخضر دخول · أحمر خروج)</figcaption><svg width="100%" height="${height}" viewBox="0 0 ${w} ${height}">${bars}</svg></figure>`;
  }

  function kpi(label, value, tone = '') {
    return `<div class="kpi ${tone}"><div class="kpi-label">${esc(label)}</div><div class="kpi-value badge-number">${esc(value)}</div></div>`;
  }

  function miniTable(headers, rows) {
    if (!rows.length) return '<p class="muted">لا سجلات في هذا اليوم.</p>';
    return `<table class="table daily-mini-table"><thead><tr>${headers.map(h => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(cells => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }

  function dailyReportHtml(report, formatDateTime) {
    if (!report) return '';
    const fmt = formatDateTime || (iso => esc(String(iso || '').slice(0, 16)));
    const s = report.snapshot.soldiers;
    const p = report.snapshot.permits;
    const g = report.activity.gate;
    const v = report.activity.visitors;
    const cn = report.activity.canteen;
    const bf = report.activity.buffet;
    const ft = report.activity.fitness;

    const personnelDonut = svgDonut([
      { label: 'داخل الوحدة', value: s.inside, color: '#2d6a4f' },
      { label: 'خارج الوحدة', value: s.outside, color: '#bc4749' },
      { label: 'مؤرشف', value: s.archived, color: '#94a3b8' },
    ].filter(x => x.value > 0));

    const companyBars = svgBars(s.byCompany.map(c => ({ label: c.company, value: c.count })), { title: 'الأفراد النشطون حسب السرية', color: '#244b46' });
    const reasonBars = svgBars(g.byReason.map(r => ({ label: r.reason, value: r.count })), { title: 'أسباب الخروج (اليوم)', color: '#386641' });
    const visitorBars = svgBars(v.byCategory.map(c => ({ label: c.category, value: c.count })), { title: 'زوار حسب الفئة', color: '#6a4c93' });
    const foodBars = svgBars([
      ...cn.outlets.map(o => ({ label: `ك ${o.name}`, value: Math.round(o.totalCents / 100) || o.count })),
      ...bf.outlets.map(o => ({ label: `ب ${o.name}`, value: Math.round(o.totalCents / 100) || o.count })),
    ], { title: 'مبيعات الكانتين والبوفيه (جنيه)', color: '#bc6c25', maxItems: 16 });

    const fitnessBars = svgBars(ft.byType.map(t => ({ label: t.type, value: t.count })), { title: 'اختبارات اللياقة', color: '#0077b6' });

    return `<div class="daily-report-dashboard">
  <header class="daily-report-head"><div><p class="page-eyebrow">تقرير تشغيلي</p><h2>${esc(report.unit.name)}</h2><p class="muted">${esc(report.unit.parentFormation || '')}</p></div>
  <div class="daily-report-meta"><strong class="num">${esc(report.date)}</strong><span class="muted">توليد: ${fmt(report.generatedAt)}</span></div></header>

  <div class="kpi-row daily-kpi-row">${kpi('أفراد نشطون', s.total)}${kpi('داخل', s.inside, 'tone-in')}${kpi('خارج', s.outside, 'tone-out')}${kpi('تصاريح نشطة', p.activeOutside)}${kpi('متأخرون', p.late, p.late ? 'tone-warn' : '')}${kpi('حركات بوابة', g.total)}${kpi('زيارات', v.checkIns)}${kpi('كانتين', cash(cn.totalCents))}${kpi('بوفيه', cash(bf.totalCents))}</div>

  <div class="daily-charts-grid">
    <div class="card chart-card">${personnelDonut}</div>
    <div class="card chart-card">${companyBars}</div>
    <div class="card chart-card chart-wide">${svgGateHours(g.byHour)}</div>
    <div class="card chart-card">${reasonBars}</div>
    <div class="card chart-card">${visitorBars}</div>
    <div class="card chart-card">${foodBars}</div>
    <div class="card chart-card">${fitnessBars}</div>
  </div>

  <div class="daily-details-grid">
    <div class="card"><div class="card-header"><h3>آخر حركات البوابة</h3></div><div class="card-body no-pad">${miniTable(['الوقت', 'العسكري', 'الحركة', 'السبب'], g.recent.map(r => [fmt(r.at), esc(r.name), r.kind === 'entry' ? 'دخول' : 'خروج', esc(r.reason)]))}</div></div>
    <div class="card"><div class="card-header"><h3>زوار اليوم</h3></div><div class="card-body no-pad">${miniTable(['الدخول', 'الزائر', 'الفئة', 'الغرض'], v.recent.map(r => [fmt(r.at), esc(r.name), esc(r.category_name), esc(r.purpose)]))}</div></div>
    <div class="card"><div class="card-header"><h3>كانتين</h3><span class="muted">${cn.transactions} عملية</span></div><div class="card-body no-pad">${miniTable(['الوقت', 'العسكري', 'المبلغ'], cn.recent.map(r => [fmt(r.at), esc(r.name), esc(cash(r.amount_cents))]))}</div></div>
    <div class="card"><div class="card-header"><h3>بوفيه</h3><span class="muted">${bf.transactions} عملية</span></div><div class="card-body no-pad">${miniTable(['الوقت', 'العسكري', 'المبلغ'], bf.recent.map(r => [fmt(r.at), esc(r.name), esc(cash(r.amount_cents))]))}</div></div>
    <div class="card"><div class="card-header"><h3>لياقة</h3></div><div class="card-body no-pad">${miniTable(['التاريخ', 'العسكري', 'الاختبار', 'النتيجة'], ft.recent.map(r => [esc(String(r.date).slice(0, 10)), esc(r.name), esc(r.type), esc(`${r.value} ${r.unit || ''}`)]))}</div></div>
    <div class="card"><div class="card-header"><h3>سجل إداري (آخر 15)</h3></div><div class="card-body no-pad">${miniTable(['الوقت', 'المستخدم', 'الإجراء'], (report.audit || []).map(a => [fmt(a.at), esc(a.username), esc(a.action)]))}</div></div>
  </div>
  <p class="module-hint">نقاط البيع: ${report.snapshot.outlets.canteen} كانتين · ${report.snapshot.outlets.buffet} بوفيه. التقرير يجمع لقطة الأفراد + نشاط اليوم بتوقيت القاهرة.</p>
</div>`;
  }

  window.DailyReport = { dailyReportHtml };
})();
