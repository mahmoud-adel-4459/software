'use strict';
/* global document */

/** Runs in the document renderer after fonts/images load. Each physical page owns its furniture. */
function paginateMemo() {
  if (document.documentElement.dataset.memoPaginated) return true;
  const original = document.querySelector('.memo-page');
  if (!original) return true;
  const source = original.querySelector('.memo-content');
  const footer = original.querySelector('.memo-footer');
  const blocks = Array.from(source.childNodes).filter((node) => node.nodeType === 1 || node.textContent.trim());
  const furniture = Array.from(original.children).filter((node) => node !== source && node !== footer);
  const pages = [];
  let content;
  const fits = () => content.scrollHeight <= content.clientHeight + 1;
  function nextPage() {
    const headings = [];
    while (content?.lastElementChild && /^H[1-6]$/.test(content.lastElementChild.tagName)) {
      headings.unshift(content.lastElementChild);
      content.lastElementChild.remove();
    }
    const page = original.cloneNode(false);
    furniture.forEach((node) => page.appendChild(node.cloneNode(true)));
    content = source.cloneNode(false);
    page.appendChild(content);
    document.body.appendChild(page);
    pages.push(page);
    headings.forEach((heading) => content.appendChild(heading));
    return page;
  }
  const tooTall = () => { throw new Error('أحد صفوف أو أقسام التقرير أطول من صفحة A4؛ قلّل النص أو عدد الأعمدة.'); };
  document.body.replaceChildren();
  nextPage();
  for (const block of blocks) {
    if (block.nodeType === 1 && block.tagName === 'TABLE') {
      const newTable = () => {
        const table = block.cloneNode(false);
        Array.from(block.children).filter((node) => !['TBODY', 'TFOOT'].includes(node.tagName)).forEach((node) => table.appendChild(node.cloneNode(true)));
        const tbody = document.createElement('tbody');
        table.appendChild(tbody);
        content.appendChild(table);
        return { table, tbody };
      };
      let part = newTable();
      for (const row of Array.from(block.tBodies).flatMap((tbody) => Array.from(tbody.rows))) {
        const copy = row.cloneNode(true);
        part.tbody.appendChild(copy);
        if (!fits()) {
          copy.remove();
          if (!part.tbody.rows.length) part.table.remove();
          nextPage();
          part = newTable();
          part.tbody.appendChild(copy);
          if (!fits()) tooTall();
        }
      }
      if (block.tFoot) {
        const tail = block.tFoot.cloneNode(true);
        part.table.appendChild(tail);
        if (!fits()) {
          tail.remove();
          nextPage();
          newTable().table.appendChild(tail);
          if (!fits()) tooTall();
        }
      }
    } else {
      const copy = block.cloneNode(true);
      content.appendChild(copy);
      if (!fits()) {
        copy.remove();
        if (!content.childNodes.length) tooTall();
        nextPage();
        content.appendChild(copy);
        if (!fits()) tooTall();
      }
    }
  }
  pages.at(-1).appendChild(footer.cloneNode(true));
  document.documentElement.dataset.memoPaginated = '1';
  return true;
}

module.exports = { paginateMemo, MEMO_PAGINATION_SCRIPT: `(${paginateMemo.toString()})()` };
