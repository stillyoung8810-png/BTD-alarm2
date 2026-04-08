import type { KeyboardEvent } from 'react';

const ENTER_KEY = 'Enter';
const SPACE_KEY = ' ';

export function handlePressEnterOrSpace(
  event: KeyboardEvent<HTMLElement>,
  action: () => void,
): void {
  const isActivationKey =
    event.key === ENTER_KEY || event.key === SPACE_KEY;

  if (!isActivationKey) {
    return;
  }

  event.preventDefault();
  action();
}