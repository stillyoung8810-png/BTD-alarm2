import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type RuntimeFileContract = {
  readonly path: string;
  readonly mustContain: readonly string[];
  readonly mustNotContain?: readonly string[];
};

const RUNTIME_FILE_CONTRACTS: readonly RuntimeFileContract[] = [
  {
    path: 'components/ui/constants.ts',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'min-h-[100dvh]',
      'min-h-0 flex-1 overflow-y-auto overscroll-contain',
      'env(safe-area-inset-bottom,0px)',
    ],
  },
  {
    path: 'components/TradeExecutionModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingTradeRef',
      'Promise.resolve(onSave(',
      'aria-busy={isSaving}',
    ],
    mustNotContain: ['h-screen', 'h-[100vh]', 'max-h-[calc(100vh-8rem)]'],
  },
  {
    path: 'components/QuickInputModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingTradeRef',
      'Promise.resolve(onSave(',
      'aria-busy={isSaving}',
    ],
    mustNotContain: ['h-screen', 'h-[100vh]', 'max-h-[calc(100vh-8rem)]'],
  },
  {
    path: 'components/InfoModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'role="button"',
      'tabIndex={0}',
      'handlePressEnterOrSpace',
    ],
    mustNotContain: ['h-screen', 'h-[100vh]', 'max-h-[calc(100vh-8rem)]'],
  },
  {
    path: 'components/CheckoutModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingRef',
      'await Promise.resolve(handleTossIapPay())',
    ],
    mustNotContain: ['h-screen', 'h-[100vh]', 'max-h-[calc(100vh-8rem)]'],
  },
  {
    path: 'components/SettlementModals.tsx',
    mustContain: [
      'max-h-[calc(100dvh-2rem)]',
      'min-h-0 flex-1 overflow-y-auto overscroll-contain',
      'pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
    ],
    mustNotContain: ['MINIAPP_MODAL_LAYOUT', 'h-screen', 'h-[100vh]'],
  },
] as const;

function readWorkspaceFile(relativePath: string): string {
  return readFileSync(path.resolve(process.cwd(), relativePath), 'utf8');
}

describe('miniapp modal runtime layout contract', () => {
  it.each(RUNTIME_FILE_CONTRACTS)('$path satisfies required layout contract', (contract) => {
    const source = readWorkspaceFile(contract.path);

    for (const requiredText of contract.mustContain) {
      expect(source, `${contract.path} must contain ${requiredText}`).toContain(requiredText);
    }

    for (const blockedText of contract.mustNotContain ?? []) {
      expect(source, `${contract.path} must not contain ${blockedText}`).not.toContain(
        blockedText,
      );
    }
  });
});
