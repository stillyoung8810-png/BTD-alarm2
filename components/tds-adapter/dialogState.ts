export interface AlertDialogState {
  isOpen: boolean;
  title: string;
  body: string;
}

export const createClosedAlertDialogState = (): AlertDialogState => ({
  isOpen: false,
  title: '',
  body: '',
});
