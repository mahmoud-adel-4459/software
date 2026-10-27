'use strict';
const { esc } = require('./format.cjs');
const fs = require('node:fs');
const path = require('node:path');

const MEMO_LOGO = `data:image/png;base64,${fs.readFileSync(path.join(__dirname, '../../assets/logokr.png')).toString('base64')}`;

/** Absolute furniture is attached to each physical page by memo-pagination.cjs. */
function memoDocument({ title, body, settings, fontUrl, defaultLogo }) {
  const logo = settings.memoLogo || MEMO_LOGO || settings.logo || defaultLogo;
  const unit = settings.memoUnitLine || 'الكتيبة ١٢٣ مدفعية م ط ش ب';
  const formation = settings.memoFormation || 'قيادة قوات الحرس الجمهوري';
  const signer = (side, rank, role) => {
    const name = settings[`memo${side}Name`] || '................................';
    return (
      `<section class="memo-signature ${side.toLowerCase()}"><div class="signature-label">التوقيع / <span>........................</span></div>` +
      `<div>${esc(settings[`memo${side}Rank`] || rank)} / ${esc(name)}</div>` +
      `<div>${esc(settings[`memo${side}Role`] || role)}</div><div>${esc(unit)}</div></section>`
    );
  };
  const css = `
    @page{size:A4 portrait;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;color:#000;font-family:'Times New Roman',Plex,serif;font-size:11pt;line-height:1.4;direction:rtl;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .memo-page{position:relative;width:210mm;height:296.5mm;overflow:hidden;break-inside:avoid;page-break-inside:avoid;background:#fff}
    .memo-page+.memo-page{break-before:page;page-break-before:always}
    .memo-frame{position:absolute;inset:6mm 8mm;border:1.4mm double #00118b;pointer-events:none;z-index:3}
    .memo-frame i{position:absolute;width:4mm;height:4mm;border:.35mm solid #00118b;background:transparent}
    .memo-frame .tl{top:-2mm;left:-2mm}.memo-frame .tr{top:-2mm;right:-2mm}.memo-frame .bl{bottom:-2mm;left:-2mm}.memo-frame .br{bottom:-2mm;right:-2mm}
    .memo-header{position:absolute;top:12mm;left:20mm;right:20mm;height:36mm;z-index:2}
    .memo-formation{position:absolute;top:0;right:0;text-align:right;font-weight:bold;font-size:10pt;line-height:1.25;white-space:pre-line}
    .memo-logo{position:absolute;top:-1mm;left:0;width:17mm;height:19mm;object-fit:contain}
    .memo-heading{position:absolute;top:27mm;left:0;right:0;margin:0;text-align:center;font-size:14pt;text-decoration:underline;text-underline-offset:1mm;font-weight:bold}
    .memo-watermark{position:absolute;top:102mm;left:50%;transform:translateX(-50%);width:116mm;height:100mm;object-fit:contain;opacity:.10;pointer-events:none;z-index:0}
    .memo-content{position:absolute;top:52mm;bottom:66mm;left:20mm;right:20mm;z-index:1;overflow-wrap:anywhere;display:flow-root}
    .memo-content>h1,.memo-content>h2{font-size:12pt;margin:0 0 3mm;text-align:center}
    .memo-content p{margin:2mm 0}
    table{width:100%;border-collapse:collapse;font-size:10pt;table-layout:auto;background:transparent}
    td,th{border:.2mm solid #555;padding:1.4mm 1mm;text-align:right;overflow-wrap:anywhere}
    thead{display:table-header-group}tr{break-inside:avoid}h1,h2{break-after:avoid}
    .memo-footer{position:absolute;bottom:13mm;left:20mm;right:20mm;height:42mm;overflow:hidden;z-index:2;font-size:10pt;font-weight:bold;line-height:1.3}
    .memo-signature{position:absolute;max-width:48%;text-align:right}.memo-signature.right{right:0;top:0}.memo-signature.left{left:0;bottom:0}
    .signature-label{margin-bottom:1mm}.signature-label span{display:inline-block;min-width:32mm}
    @media screen{html{background:#e8eaf0}body{width:210mm;margin:8mm auto}.memo-page{margin-bottom:8mm;box-shadow:0 1mm 5mm #0002}}
  `;
  const image = logo ? `<img class="memo-logo" src="${esc(logo)}" alt="شعار الوحدة">` : '';
  const watermark = logo ? `<img class="memo-watermark" src="${esc(logo)}" alt="">` : '';
  return (
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none';style-src 'unsafe-inline';font-src file:;img-src data:;"><title>${esc(title)}</title>` +
    `<style>@font-face{font-family:Plex;src:url('${fontUrl}')}\n${css}</style></head><body><div class="memo-page">` +
    '<div class="memo-frame" aria-hidden="true"><i class="tl"></i><i class="tr"></i><i class="bl"></i><i class="br"></i></div>' +
    `<header class="memo-header">${image}<div class="memo-formation">${esc(formation)}<br>${esc(unit)}</div><h1 class="memo-heading">مذكرة تفصيلية</h1></header>` +
    watermark +
    `<main class="memo-content">${body}</main><footer class="memo-footer">` +
    signer('Right', 'نقيب', 'ضابط أمن الكتيبة') +
    signer('Left', 'مقدم', 'قائد الكتيبة') +
    '</footer></div></body></html>'
  );
}

module.exports = { memoDocument };
