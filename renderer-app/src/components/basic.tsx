import InboxIcon from '@mui/icons-material/InboxOutlined';
import UpIcon from '@mui/icons-material/ArrowDropUp';
import DownIcon from '@mui/icons-material/ArrowDropDown';
import Chip from '@mui/material/Chip';
import { SparkLineChart } from '@mui/x-charts/SparkLineChart';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { motion } from 'motion/react';
import type { ElementType, ReactNode } from 'react';
import { toneColors, tokens, type Tone } from '@/theme/tokens';

/** Page title + description on one side, actions on the other (stacked on narrow widths). */
export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ justifyContent: 'space-between', alignItems: { md: 'center' }, mb: 3 }}>
      <Box>
        <Typography variant="h2" component="h1">
          {title}
        </Typography>
        {description && (
          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 760, mt: 0.5 }}>
            {description}
          </Typography>
        )}
      </Box>
      {actions && <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>{actions}</Stack>}
    </Stack>
  );
}

/** Icon in a soft square, tinted by tone. */
export function IconSquare({ icon: Icon, tone = 'primary', size = 36 }: { icon: ElementType; tone?: Tone; size?: number }) {
  const c = toneColors[tone];
  return (
    <Box sx={{ width: size, height: size, borderRadius: `${tokens.radius}px`, bgcolor: c.soft, color: c.ink, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
      <Icon sx={{ fontSize: size * 0.55 }} />
    </Box>
  );
}

/** Card with a title row (icon, subtitle, badge, trailing action). */
export function SectionCard({
  title,
  subtitle,
  icon,
  action,
  badge,
  children,
  noPadding,
}: {
  title?: string;
  subtitle?: string;
  icon?: ElementType;
  action?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  noPadding?: boolean;
}) {
  return (
    <Card sx={{ mb: 2.5 }}>
      {(title || action) && (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', p: 2, pb: noPadding ? 1.5 : 0 }}>
          {icon && <IconSquare icon={icon} tone="primary" size={32} />}
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h5" component="h2" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {subtitle && <Typography variant="caption">{subtitle}</Typography>}
          </Box>
          {badge}
          {action}
        </Stack>
      )}
      <Box sx={noPadding ? { pt: 0 } : { p: 2 }}>{children}</Box>
    </Card>
  );
}

/** KPI tile: label, icon square, tabular number; optionally a clickable filter. */
export function KpiCard({
  label,
  value,
  icon,
  tone = 'primary',
  loading,
  hint,
  active,
  onClick,
  live,
  delta,
  spark,
  highlight,
}: {
  label: string;
  value: ReactNode;
  icon?: ElementType;
  tone?: Tone;
  loading?: boolean;
  hint?: string;
  active?: boolean;
  onClick?: () => void;
  live?: boolean;
  /** Change vs the previous period in percent (null = no baseline); `invert` makes a drop good. */
  delta?: { percent: number | null; invert?: boolean };
  spark?: number[];
  /** Gold accent edge for the hero indicator. */
  highlight?: boolean;
}) {
  const c = toneColors[tone];
  return (
    <Card
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      className="kpi-card-hover"
      sx={{
        p: 2,
        height: '100%',
        cursor: onClick ? 'pointer' : 'default',
        borderColor: active ? c.main : highlight ? tokens.gold : undefined,
        borderTop: highlight ? `3px solid ${tokens.gold}` : undefined,
        borderWidth: active ? 1.5 : 1,
        bgcolor: active ? c.soft : tokens.surface,
        '&:hover': { boxShadow: tokens.shadow.cardHover },
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          {live && <span className="live-pulse-dot" style={{ background: c.main }} />}
          <Typography variant="subtitle2">{label}</Typography>
        </Stack>
        {icon && <IconSquare icon={icon} tone={tone} />}
      </Stack>
      {loading ? (
        <Skeleton width={90} height={40} />
      ) : (
        <Typography component="div" sx={{ fontSize: 26, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tone === 'neutral' || tone === 'primary' ? tokens.text : c.ink, lineHeight: 1.3 }}>
          {value}
        </Typography>
      )}
      {(delta || hint) && (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {delta && !loading && <DeltaChip percent={delta.percent} invert={delta.invert} />}
          {hint && <Typography variant="caption">{hint}</Typography>}
        </Stack>
      )}
      {spark && spark.length > 1 && !loading && (
        <Box sx={{ mt: 1, mx: -0.5 }} aria-hidden>
          <SparkLineChart data={spark} height={40} color={c.main} curve="natural" area />
        </Box>
      )}
    </Card>
  );
}

/** ▲/▼ percent chip; green when the change is good, red when bad, neutral without a baseline. */
export function DeltaChip({ percent, invert }: { percent: number | null; invert?: boolean }) {
  if (percent === null || !Number.isFinite(percent)) return <Chip size="small" label="لا مقارنة" sx={{ bgcolor: toneColors.neutral.soft, color: toneColors.neutral.ink, height: 22 }} />;
  const rounded = Math.round(percent);
  const good = rounded === 0 ? null : invert ? rounded < 0 : rounded > 0;
  const c = good === null ? toneColors.neutral : good ? toneColors.green : toneColors.red;
  return (
    <Chip size="small" aria-label={`التغير ${rounded}%`} label={<span className="num">{`${Math.abs(rounded)}%`}</span>}
      icon={rounded >= 0 ? <UpIcon style={{ color: c.ink }} /> : <DownIcon style={{ color: c.ink }} />}
      sx={{ bgcolor: c.soft, color: c.ink, height: 22, '& .MuiChip-icon': { fontSize: 16 } }} />
  );
}

/** Pill tabs with an animated sliding indicator. */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  id = 'seg',
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  id?: string;
}) {
  return (
    <Stack direction="row" role="tablist" sx={{ bgcolor: tokens.ice, p: 0.5, borderRadius: `${tokens.radius}px`, gap: 0.5, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Box
            key={o.value}
            component="button"
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            sx={{ position: 'relative', border: 0, background: 'none', cursor: 'pointer', px: 2, py: 0.75, borderRadius: `${tokens.radius - 2}px`, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: on ? tokens.onDark : tokens.primary, whiteSpace: 'nowrap' }}
          >
            {on && (
              <motion.span
                layoutId={`${id}-indicator`}
                transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                style={{ position: 'absolute', inset: 0, background: tokens.primary, borderRadius: tokens.radius - 2, boxShadow: tokens.shadow.sm }}
              />
            )}
            <span style={{ position: 'relative' }}>
              {o.label}
              {o.count !== undefined ? ` (${o.count})` : ''}
            </span>
          </Box>
        );
      })}
    </Stack>
  );
}

/** Label/value rows separated by lines. */
export function DetailList({ rows, labelWidth = 150 }: { rows: { label: string; value: ReactNode }[]; labelWidth?: number }) {
  return (
    <Box component="dl" sx={{ m: 0 }}>
      {rows.map((r, i) => (
        <Box key={`${r.label}-${i}`} sx={{ display: 'flex', gap: 2, py: 1, borderBottom: i === rows.length - 1 ? 0 : `1px solid ${tokens.borderSubtle}` }}>
          <Typography component="dt" variant="body2" color="text.secondary" sx={{ width: labelWidth, flexShrink: 0 }}>
            {r.label}
          </Typography>
          <Typography component="dd" variant="body2" sx={{ m: 0, fontWeight: 600, wordBreak: 'break-word' }}>
            {r.value}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

/** Empty state with an icon and a next-step hint. */
export function EmptyState({ title, hint, icon: Icon = InboxIcon, action }: { title: string; hint?: string; icon?: ElementType; action?: ReactNode }) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', justifyContent: 'center', py: 6, textAlign: 'center', color: tokens.textSecondary }}>
      <Icon sx={{ fontSize: 44, color: tokens.navy200 }} />
      <Typography variant="h5">{title}</Typography>
      {hint && <Typography variant="body2">{hint}</Typography>}
      {action}
    </Stack>
  );
}

/** Skeleton rows for first load. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Stack spacing={1} sx={{ p: 2 }}>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} variant="rounded" height={44} />
      ))}
    </Stack>
  );
}
