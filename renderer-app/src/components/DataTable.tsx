import Box from '@mui/material/Box';
import { arSD } from '@mui/x-data-grid/locales';
import { DataGrid, type GridColDef, type GridRowParams, type GridValidRowModel } from '@mui/x-data-grid';
import { useState } from 'react';
import { EmptyState } from './basic';

export type Column<R extends GridValidRowModel> = GridColDef<R>;

/** DataGrid wrapper: client pagination (10/20/50/100), RTL-friendly sizing, empty state. */
export function DataTable<R extends GridValidRowModel>({
  rows,
  columns,
  loading,
  emptyText = 'لا توجد سجلات',
  emptyHint = 'غيّر معايير البحث أو أضف سجلًا جديدًا.',
  onRowClick,
  pageSize = 20,
  getRowId,
}: {
  rows: R[];
  columns: Column<R>[];
  loading?: boolean;
  emptyText?: string;
  emptyHint?: string;
  onRowClick?: (row: R) => void;
  pageSize?: number;
  getRowId?: (row: R) => string;
}) {
  const [model, setModel] = useState({ page: 0, pageSize });
  return (
    <Box sx={{ width: '100%' }}>
      <DataGrid<R>
        rows={rows}
        columns={columns}
        loading={loading}
        getRowId={getRowId}
        paginationModel={model}
        onPaginationModelChange={setModel}
        pageSizeOptions={[10, 20, 50, 100]}
        disableRowSelectionOnClick
        disableColumnMenu
        disableVirtualization={import.meta.env.MODE === 'test'}
        rowHeight={60}
        columnHeaderHeight={48}
        autoHeight
        onRowClick={onRowClick ? (p: GridRowParams<R>) => onRowClick(p.row) : undefined}
        localeText={{ ...arSD.components.MuiDataGrid.defaultProps.localeText, paginationDisplayedRows: ({ from, to, count }) => `${from}–${to} من ${count}` }}
        slots={{ noRowsOverlay: () => <EmptyState title={emptyText} hint={emptyHint} /> }}
        sx={{ cursor: onRowClick ? 'pointer' : 'default', '& .MuiDataGrid-overlayWrapper': { minHeight: 220 } }}
      />
    </Box>
  );
}
