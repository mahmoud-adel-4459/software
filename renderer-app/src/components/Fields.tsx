import MenuItem from '@mui/material/MenuItem';
import TextField, { type TextFieldProps } from '@mui/material/TextField';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';

type Common<T extends FieldValues> = {
  control: Control<T>;
  name: Path<T>;
  label: string;
} & Omit<TextFieldProps, 'name' | 'label' | 'value' | 'onChange' | 'onBlur' | 'select'>;

/** react-hook-form text input with the error message wired in. */
export function RhfText<T extends FieldValues>({ control, name, label, type, ...rest }: Common<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          {...rest}
          {...field}
          value={field.value ?? ''}
          label={label}
          type={type}
          error={Boolean(fieldState.error)}
          helperText={fieldState.error?.message ?? rest.helperText}
          slotProps={{
            ...rest.slotProps,
            inputLabel: { shrink: type === 'date' || type === 'time' || type === 'month' ? true : undefined },
          }}
        />
      )}
    />
  );
}

/** react-hook-form select. */
export function RhfSelect<T extends FieldValues>({
  control,
  name,
  label,
  options,
  ...rest
}: Common<T> & { options: { value: string; label: string }[] }) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField {...rest} {...field} select label={label} error={Boolean(fieldState.error)} helperText={fieldState.error?.message ?? rest.helperText}>
          {options.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </TextField>
      )}
    />
  );
}

/** Plain select helper for non-form filters. */
export function SelectField({
  label,
  value,
  onChange,
  options,
  minWidth = 180,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  minWidth?: number;
}) {
  return (
    <TextField select label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth, width: 'auto' }}>
      {options.map((o) => (
        <MenuItem key={o.value} value={o.value}>
          {o.label}
        </MenuItem>
      ))}
    </TextField>
  );
}
