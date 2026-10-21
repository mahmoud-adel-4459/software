import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api } from '@/api/endpoints';
import type { AuditRow } from '@/api/types';
import { PageHeader } from '@/components/basic';
import { DataTable, type Column } from '@/components/DataTable';
import { SearchField } from '@/components/interactive';
import { formatDateTime } from '@/lib/format';
import { ExcelButtons } from '@/components/ExcelButtons';
import { sheetWorkbook } from '@/lib/excel';

/** Latest 500 administrative operations with device and affected record. */
export function AuditPage() {
  const q = useQuery({ queryKey: ['audit'], queryFn: api.audit });
  const [text, setText] = useState('');
  const rows = useMemo(() => (q.data ?? []).filter((r) => !text || `${r.username} ${r.action} ${r.device_id} ${r.entity_id}`.includes(text)).map((r, i) => ({ ...r, id: r.id ?? `${r.at}-${i}` })), [q.data, text]);
  const columns: Column<AuditRow & { id: string }>[] = [
    { field: 'at', headerName: 'التاريخ', width: 170, valueFormatter: (v: string) => formatDateTime(v) },
    { field: 'username', headerName: 'المستخدم', width: 160 },
    { field: 'action', headerName: 'الإجراء', flex: 1, minWidth: 160 },
    { field: 'device_id', headerName: 'الجهاز', flex: 1, minWidth: 160, renderCell: (c) => <span className="num">{c.value}</span> },
    { field: 'entity_id', headerName: 'السجل', flex: 1, minWidth: 160, renderCell: (c) => <span className="num">{c.value}</span> },
  ];
  return (
    <>
      <PageHeader title="سجل العمليات" description="آخر العمليات الإدارية على الخادم مع معرف الجهاز والسجل المتأثر."
        actions={<ExcelButtons build={() => sheetWorkbook('سجل-العمليات', 'سجل العمليات', [{ header: 'التاريخ', key: 'at', width: 22 }, { header: 'المستخدم', key: 'username' }, { header: 'الإجراء', key: 'action', width: 28 }, { header: 'الجهاز', key: 'device_id', width: 30 }, { header: 'السجل', key: 'entity_id', width: 38 }],
          rows.map((r) => ({ at: formatDateTime(r.at), username: r.username, action: r.action, device_id: r.device_id, entity_id: r.entity_id })))} />} />
      <Paper variant="outlined" sx={{ p: 2, mb: 2 }}><SearchField value={text} onChange={setText} placeholder="بحث في السجل" /></Paper>
      <Paper variant="outlined"><DataTable rows={rows} columns={columns} loading={q.isFetching} emptyText="لا توجد عمليات" emptyHint="ستظهر العمليات الإدارية هنا." /></Paper>
      <Typography variant="caption" sx={{ display: 'block', mt: 1 }}>أحدث 500 عملية؛ الأثر الكامل محفوظ في الخادم.</Typography>
    </>
  );
}
