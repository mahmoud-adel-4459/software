import Box from '@mui/material/Box';
import { LOGO_SRC } from '@/lib/brand';
import { tokens } from '@/theme/tokens';

/** The official emblem as a circular mark (the file has square corners, so it is clipped round). */
export function BrandMark({ size = 44, glow }: { size?: number; glow?: boolean }) {
  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt="شعار منظومة شؤون الوحدة الداخلية"
      draggable={false}
      sx={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, boxShadow: glow ? tokens.shadow.goldGlow : undefined, border: `1px solid ${tokens.gold}` }}
    />
  );
}
