import { createTheme, type Theme } from '@mui/material/styles';
import { arSD } from '@mui/material/locale';
import { arSD as gridArSD } from '@mui/x-data-grid/locales';
import '@mui/x-data-grid/themeAugmentation';
import { FONT_FAMILY, tokens } from './tokens';

declare module '@mui/material/Button' {
  interface ButtonPropsVariantOverrides {
    tonal: true;
  }
}

const r = tokens.radius;

/** The MUI theme: RTL, 8px radii, green brand, Plex Arabic. */
export function buildTheme(): Theme {
  return createTheme(
    {
      direction: 'rtl',
      cssVariables: true,
      shape: { borderRadius: r },
      palette: {
        primary: {
          main: tokens.primary,
          dark: tokens.primaryHover,
          light: tokens.primaryLight,
          contrastText: tokens.onDark,
        },
        secondary: { main: tokens.secondary },
        error: { main: tokens.red, light: tokens.redSoft, dark: tokens.redInk },
        success: { main: tokens.green, light: tokens.greenSoft, dark: tokens.greenInk },
        warning: { main: tokens.amberInk, light: tokens.amberSoft },
        info: { main: tokens.blue, light: tokens.blueSoft },
        background: { default: tokens.bg, paper: tokens.surface },
        text: { primary: tokens.text, secondary: tokens.textSecondary, disabled: tokens.navy200 },
        divider: tokens.border,
      },
      typography: {
        fontFamily: FONT_FAMILY,
        h1: { fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em' },
        h2: { fontSize: 26, fontWeight: 700 },
        h3: { fontSize: 22, fontWeight: 700 },
        h4: { fontSize: 18, fontWeight: 700 },
        h5: { fontSize: 16, fontWeight: 700 },
        h6: { fontSize: 14, fontWeight: 700 },
        subtitle1: { fontSize: 15, fontWeight: 600 },
        subtitle2: { fontSize: 13, fontWeight: 600, color: tokens.textSecondary },
        body1: { fontSize: 15, lineHeight: 1.7 },
        body2: { fontSize: 14, lineHeight: 1.6 },
        caption: { fontSize: 12, color: tokens.textSecondary },
        button: { fontSize: 14, fontWeight: 600, textTransform: 'none' },
      },
      components: {
        MuiCssBaseline: {
          styleOverrides: {
            body: { backgroundColor: tokens.bg, WebkitFontSmoothing: 'antialiased' },
            '::selection': { background: tokens.ice, color: tokens.primary },
            '@media (prefers-reduced-motion: reduce)': {
              '*, *::before, *::after': {
                animationDuration: '0.01ms !important',
                transitionDuration: '0.01ms !important',
              },
            },
          },
        },
        MuiButton: {
          defaultProps: { disableElevation: true },
          styleOverrides: {
            root: {
              minHeight: 40,
              borderRadius: r,
              transition: 'transform .15s, box-shadow .15s',
              '&:active': { transform: 'scale(.98)' },
            },
            sizeSmall: { minHeight: 32 },
            sizeLarge: { minHeight: 52, fontSize: 16 },
          },
          variants: [
            {
              props: { variant: 'contained', color: 'primary' },
              style: { boxShadow: tokens.shadow.sm, '&:hover': { boxShadow: tokens.shadow.cardHover }, '&.Mui-focusVisible': { boxShadow: tokens.shadow.goldFocus, outline: `1px solid ${tokens.gold}` } },
            },
            {
              props: { variant: 'tonal' },
              style: {
                backgroundColor: tokens.ice,
                color: tokens.primary,
                '&:hover': { backgroundColor: tokens.borderStrong },
              },
            },
          ],
        },
        MuiIconButton: { styleOverrides: { root: { borderRadius: r, '&:active': { transform: 'scale(.94)' } } } },
        MuiPaper: {
          defaultProps: { elevation: 0 },
          styleOverrides: { outlined: { borderColor: tokens.border, boxShadow: tokens.shadow.card } },
        },
        MuiCard: { defaultProps: { variant: 'outlined' }, styleOverrides: { root: { boxShadow: tokens.shadow.card } } },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              backgroundColor: tokens.surface,
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.navy200 },
              '&.Mui-focused': { boxShadow: tokens.shadow.focusRing },
            },
            notchedOutline: { borderColor: tokens.border },
          },
        },
        MuiTextField: { defaultProps: { fullWidth: true, size: 'small' } },
        MuiChip: { styleOverrides: { root: { fontWeight: 700, borderRadius: r } } },
        MuiDialog: { styleOverrides: { paper: { borderRadius: r, boxShadow: tokens.shadow.modal } } },
        MuiDialogTitle: { styleOverrides: { root: { fontSize: 18, fontWeight: 700 } } },
        MuiTooltip: { styleOverrides: { tooltip: { backgroundColor: tokens.navy, fontSize: 12 } } },
        MuiMenu: { styleOverrides: { paper: { boxShadow: tokens.shadow.dropdown, borderRadius: r } } },
        MuiDataGrid: {
          styleOverrides: {
            root: {
              border: 0,
              '& .MuiDataGrid-columnHeaders': { backgroundColor: tokens.ice100 },
              '& .MuiDataGrid-columnHeader': { backgroundColor: tokens.ice100 },
              '& .MuiDataGrid-columnHeaderTitle': { fontWeight: 700, color: tokens.textSecondary },
              '& .MuiDataGrid-cell': { borderColor: tokens.borderSubtle },
              '& .MuiDataGrid-row:hover': { backgroundColor: tokens.ice100 },
              '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within': { outline: 'none' },
              '& .MuiDataGrid-cell:focus-visible': { outline: `2px solid ${tokens.primary}` },
            },
          },
        },
      },
    },
    arSD,
    gridArSD,
  );
}
