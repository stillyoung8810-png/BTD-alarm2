import React, { useCallback, useEffect, useRef, useState } from 'react';

const EMPTY_DRAFT = '';

function formatCommittedNumberForDraft(value: number): string {
  if (!Number.isFinite(value)) {
    return EMPTY_DRAFT;
  }

  return String(value);
}

export interface DraftNumberInputProps {
  id?: string;
  value: number;
  onCommit: (rawValue: string) => number;
  allowDecimal?: boolean;
  className?: string;
  ariaLabel?: string;
  ariaInvalid?: boolean;
  disabled?: boolean;
}

export function DraftNumberInput(
  props: DraftNumberInputProps,
): React.ReactElement {
  const {
    id,
    value,
    onCommit,
    allowDecimal = false,
    className,
    ariaLabel,
    ariaInvalid,
    disabled,
  } = props;

  const [draftValue, setDraftValue] = useState<string>(() =>
    formatCommittedNumberForDraft(value),
  );
  const isFocusedRef = useRef(false);

  useEffect(() => {
    if (isFocusedRef.current) {
      return;
    }

    const nextDraft = formatCommittedNumberForDraft(value);
    setDraftValue((previous) =>
      previous === nextDraft ? previous : nextDraft,
    );
  }, [value]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = event.target.value;
      let sanitized = rawValue.replace(/[^0-9.]/g, '');

      if (!allowDecimal) {
        sanitized = sanitized.replace(/\./g, '');
      } else {
        const decimalParts = sanitized.split('.');
        if (decimalParts.length > 2) {
          sanitized = `${decimalParts[0]}.${decimalParts.slice(1).join('')}`;
        }
      }

      setDraftValue(sanitized);
    },
    [allowDecimal],
  );

  const handleFocus = useCallback(() => {
    isFocusedRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    isFocusedRef.current = false;
    const committedValue = onCommit(draftValue);
    setDraftValue(formatCommittedNumberForDraft(committedValue));
  }, [draftValue, onCommit]);

  return (
    <input
      id={id}
      type="text"
      inputMode={allowDecimal ? 'decimal' : 'numeric'}
      className={className}
      value={draftValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid ?? false}
    />
  );
}
