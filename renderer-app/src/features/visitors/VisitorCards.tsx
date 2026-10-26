import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import Alert from '@mui/material/Alert';
import TextField from '@mui/material/TextField';
import MenuItem from '@mui/material/MenuItem';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '@/api/endpoints';
import { SectionCard } from '@/components/basic';
import { DocButtons } from '@/components/DocButtons';

const CARD_NUMBERS = Array.from({ length: 24 }, (_, i) => i + 1);

/** Fixed card inventory with batch printing and an entry point to gate registration. */
export function VisitorCards() {
  const [selected, setSelected] = useState(0);
  const [showCards, setShowCards] = useState(false);
  const navigate = useNavigate();
  const cards = useQuery({ queryKey: ['visitor-cards'], queryFn: api.visitorCards, refetchInterval: 10_000 });
  return (
    <SectionCard title="بطاقات الزوار من 1 إلى 24" subtitle="البطاقات قابلة لإعادة الاستخدام؛ بيانات كل زيارة تُسجّل من البوابة.">
      <Stack spacing={2}>
        <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
              <TextField select size="small" fullWidth={false} label="البطاقات المطلوب طباعتها" value={selected}
                onChange={e => setSelected(Number(e.target.value))} sx={{ width: { xs: '100%', sm: 230 }, flexShrink: 0 }}>
                <MenuItem value={0}>كل البطاقات (1–24)</MenuItem>
                {CARD_NUMBERS.map(no => <MenuItem key={no} value={no}>بطاقة {no}</MenuItem>)}
              </TextField>
              <DocButtons doc={{ type: 'visitor-cards', cardNos: selected === 0 ? CARD_NUMBERS : [selected] }} />
        </Box>
        {cards.isError && <Alert severity="error">تعذر تحديث حالة البطاقات <Button onClick={() => cards.refetch()}>إعادة المحاولة</Button></Alert>}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          {cards.data && <Typography variant="body2" color="text.secondary">المتاحة: {cards.data.filter(c => !c.openVisit).length} — المستخدمة: {cards.data.filter(c => c.openVisit).length}</Typography>}
          <Button onClick={() => setShowCards(value => !value)} aria-expanded={showCards} aria-controls="visitor-card-status">{showCards ? 'إخفاء حالة البطاقات' : 'عرض حالة البطاقات الـ24'}</Button>
        </Box>
        {showCards && <Box id="visitor-card-status" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 2 }}>
          {CARD_NUMBERS.map(cardNo => {
            const card = cards.data?.find(c => c.cardNo === cardNo);
            return (
              <Box key={cardNo} sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography sx={{ fontWeight: 700 }}>بطاقة {cardNo}</Typography>
                <Typography variant="body2">{card ? (card.openVisit ? `داخل الوحدة: ${card.openVisit.visitor.name}` : 'متاحة') : 'جارٍ تحديث الحالة'}</Typography>
                <Button onClick={() => navigate(`/gate?card=${cardNo}`)}>فتح في البوابة</Button>
              </Box>
            );
          })}
        </Box>}
      </Stack>
    </SectionCard>
  );
}
