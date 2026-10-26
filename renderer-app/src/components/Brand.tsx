import Box from '@mui/material/Box';
import { LOGO_SRC } from '@/lib/brand';

/** Preserve the full shield and wings on the image's transparent square. */
export function BrandMark({ size = 44, glow }: { size?: number; glow?: boolean }) {
  return (
    <Box
      component="img"
      src={LOGO_SRC}
      alt="شعار منظومة شؤون الوحدة الداخلية"
      draggable={false}
      sx={{ width: size, height: size, objectFit: 'contain', flexShrink: 0, filter: glow ? 'drop-shadow(0 0 12px rgba(255,255,255,.2))' : undefined }}
    />
  );
}
