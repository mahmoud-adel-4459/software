'use strict';
const { randomUUID } = require('node:crypto');

/** Demo soldiers when DB is empty (Lab + browser preview). */
async function seedSampleData(pool) {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM soldiers WHERE archived=false');
  if (rows[0].n > 0) return false;
  const samples = [
    { name: 'أحمد محمد علي', military_no: '000012345', national_id: '30101010101011', rank: 'جندي', company: 'السرية الأولى', unit: 'وحدة تجربة', details: { cardNo: 'B-1001', originalUnit: 'الكتيبة 5', specialty: 'مشاة', enlistDate: '2022-03-01', weaponNo: 'سلاح-445', unitJoinDate: '2024-01-15', height: '175', weight: '72', offDutyJob: '—' } },
    { name: 'محمود حسن إبراهيم', military_no: '000054321', national_id: '30202020202022', rank: 'عريف', company: 'السرية الثانية', unit: 'وحدة تجربة' },
    { name: 'خالد سعيد عبدالله', military_no: '000099887', national_id: '30303030303033', rank: 'رقيب', company: 'السرية الأولى', unit: 'وحدة تجربة' },
  ];
  for (const s of samples) {
    await pool.query(
      `INSERT INTO soldiers(id,military_no,national_id,name,rank,company,unit,phone,address,status,version,details)
       VALUES($1,$2,$3,$4,$5,$6,$7,'','','in',1,$8::jsonb)`,
      [randomUUID(), s.military_no, s.national_id, s.name, s.rank, s.company, s.unit, JSON.stringify(s.details || {})],
    );
  }
  await pool.query(
    `UPDATE settings SET data = $1::jsonb WHERE id = 1`,
    [JSON.stringify({
      unitName: 'وحدة تجربة — Lab',
      parentFormation: 'تشكيل تجريبي',
      extraReasons: ['زيارة عائلية'],
      paper: 'A4',
      margins: 'normal',
      printer: '',
      showLogo: true,
      logo: null,
    })],
  );
  return true;
}

module.exports = { seedSampleData };
