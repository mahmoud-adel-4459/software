import CheckCircleIcon from '@mui/icons-material/CheckCircleOutlined';
import ErrorIcon from '@mui/icons-material/ErrorOutlineOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SearchIcon from '@mui/icons-material/SearchOutlined';
import WarningIcon from '@mui/icons-material/WarningAmberOutlined';
import RemoveIcon from '@mui/icons-material/RemoveCircleOutlineOutlined';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useEffect, useState, type ElementType, type ReactNode } from 'react';
import { toneColors, tokens } from '@/theme/tokens';

export type ChipTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info';
const chipMap = {
  success: { c: toneColors.green, icon: CheckCircleIcon },
  warning: { c: toneColors.amber, icon: WarningIcon },
  danger: { c: toneColors.red, icon: ErrorIcon },
  info: { c: toneColors.blue, icon: CheckCircleIcon },
  neutral: { c: toneColors.neutral, icon: RemoveIcon },
} as const;

/** Status chip: Soft background + Ink text (+ icon). */
export function ToneChip({ tone, label, icon = true }: { tone: ChipTone; label: string; icon?: boolean }) {
  const m = chipMap[tone];
  const Icon = m.icon;
  return (
    <Chip
      size="small"
      label={label}
      icon={icon ? <Icon style={{ color: m.c.ink }} /> : undefined}
      sx={{ bgcolor: m.c.soft, color: m.c.ink, '& .MuiChip-icon': { fontSize: 16 } }}
    />
  );
}

export const SoldierStatusChip = ({ status }: { status: 'in' | 'out' }) => (
  <ToneChip tone={status === 'in' ? 'success' : 'warning'} label={status === 'in' ? 'داخل الوحدة' : 'خارج الوحدة'} />
);

export interface RowAction {
  label: string;
  icon?: ElementType;
  onClick: () => void;
  danger?: boolean;
  hidden?: boolean;
}
/** ⋮ menu at the end of a row. */
export function RowActions({ actions }: { actions: RowAction[] }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const visible = actions.filter((a) => !a.hidden);
  if (!visible.length) return null;
  return (
    <>
      <IconButton
        size="small"
        aria-label="إجراءات"
        onClick={(e) => {
          e.stopPropagation();
          setAnchor(e.currentTarget);
        }}
      >
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} onClick={(e) => e.stopPropagation()}>
        {visible.map((a) => (
          <MenuItem
            key={a.label}
            onClick={() => {
              setAnchor(null);
              a.onClick();
            }}
            sx={a.danger ? { color: tokens.redInk } : undefined}
          >
            {a.icon && (
              <ListItemIcon sx={{ color: 'inherit' }}>
                <a.icon fontSize="small" />
              </ListItemIcon>
            )}
            <ListItemText>{a.label}</ListItemText>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

/** Confirmation dialog; locked while `loading`. `children` can hold extra inputs (e.g. password). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'تأكيد',
  tone = 'primary',
  loading,
  confirmDisabled,
  onConfirm,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  loading?: boolean;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        {message && <DialogContentText component="div" sx={{ mb: children ? 2 : 0 }}>{message}</DialogContentText>}
        {children}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button variant="tonal" onClick={onClose} disabled={loading}>
          إلغاء
        </Button>
        <Button variant="contained" color={tone === 'danger' ? 'error' : 'primary'} loading={loading} disabled={confirmDisabled} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Debounced (350ms) search box. */
export function SearchField({
  value,
  onChange,
  placeholder = 'بحث…',
  delay = 350,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  delay?: number;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), delay);
    return () => clearTimeout(t);
  }, [text, value, onChange, delay]);
  return (
    <TextField
      value={text}
      onChange={(e) => setText(e.target.value)}
      placeholder={placeholder}
      sx={{ maxWidth: 320 }}
      slotProps={{
        htmlInput: { 'aria-label': placeholder },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
