const REQUIRED_OVERLAY_TOKENS = [
  'fixed',
  'inset-0',
  'min-h-[100dvh]',
  'items-center',
  'justify-center',
  'pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]',
] as const;

const REQUIRED_PANEL_TOKENS = [
  'flex',
  'min-h-0',
  'max-h-full',
  'w-full',
  'flex-col',
  'overflow-hidden',
] as const;

const REQUIRED_BODY_TOKENS = [
  'min-h-0',
  'flex-1',
  'overflow-y-auto',
  'overscroll-contain',
] as const;

const REQUIRED_FOOTER_TOKENS = [
  'shrink-0',
  'pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
] as const;

const REQUIRED_HEADER_TOKENS = ['shrink-0'] as const;

const DISALLOWED_BODY_TOKENS = ['max-h-[calc(100vh-8rem)]'] as const;

type ModalSeverity = 'high' | 'medium';
type ModalSlot = 'overlay' | 'panel' | 'header' | 'body' | 'footer';
type ImplementationMode = 'partial-class-replacement' | 'existing-shell-preserved';

type ModalLayoutPatch = {
  readonly id: string;
  readonly severity: ModalSeverity;
  readonly implementationMode: ImplementationMode;
  readonly changedSlots: Partial<Record<ModalSlot, string>>;
};

type ArchitectureDecision = {
  readonly shouldIntroduceSharedComponent: boolean;
  readonly sharedTokenKeys: readonly string[];
  readonly protectedRuntimeFiles: readonly string[];
};

type PostImplementationVerificationPlan = {
  readonly shouldImportRuntimeConstants: boolean;
};

type RuntimeFileContract = {
  readonly path: string;
  readonly mustContain: readonly string[];
  readonly mustNotContain?: readonly string[];
};

const miniappModalLayoutTokens = {
  overlay:
    'fixed inset-0 flex min-h-[100dvh] items-center justify-center px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]',
  panel: 'relative flex min-h-0 max-h-full w-full flex-col overflow-hidden',
  header: 'shrink-0',
  body: 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
  footer: 'shrink-0 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
} as const;

const architectureDecision: ArchitectureDecision = {
  shouldIntroduceSharedComponent: false,
  sharedTokenKeys: Object.keys(miniappModalLayoutTokens),
  protectedRuntimeFiles: [
    'components/tds-adapter/TdsDialogShell.tsx',
    'components/tds/TDSModal.tsx',
  ],
};

const postImplementationVerificationPlan: PostImplementationVerificationPlan = {
  shouldImportRuntimeConstants: true,
};

const runtimeFileContracts: readonly RuntimeFileContract[] = [
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
  },
  {
    path: 'components/QuickInputModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingTradeRef',
      'Promise.resolve(onSave(',
      'aria-busy={isSaving}',
    ],
  },
  {
    path: 'components/InfoModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'role="button"',
      'tabIndex={0}',
      'handlePressEnterOrSpace',
    ],
  },
  {
    path: 'components/CheckoutModal.tsx',
    mustContain: [
      'MINIAPP_MODAL_LAYOUT',
      'isExecutingRef',
      'await Promise.resolve(handleTossIapPay())',
    ],
    mustNotContain: ['max-h-[calc(100vh-8rem)]'],
  },
  {
    path: 'components/SettlementModals.tsx',
    mustContain: [
      'max-h-[calc(100dvh-2rem)]',
      'min-h-0 flex-1 overflow-y-auto overscroll-contain',
      'pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
    ],
    mustNotContain: ['MINIAPP_MODAL_LAYOUT'],
  },
] as const;

const proposedPatches: readonly ModalLayoutPatch[] = [
  {
    id: 'TradeExecutionModal',
    severity: 'high',
    implementationMode: 'partial-class-replacement',
    changedSlots: {
      overlay: `${miniappModalLayoutTokens.overlay} z-[120]`,
      panel: `${miniappModalLayoutTokens.panel} z-[121] max-w-2xl rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl`,
      header: `${miniappModalLayoutTokens.header} flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6`,
      body: `${miniappModalLayoutTokens.body} space-y-6 p-6`,
      footer: `${miniappModalLayoutTokens.footer} flex gap-4 border-t border-slate-200 bg-slate-50 px-6 pt-6`,
    },
  },
  {
    id: 'QuickInputModal',
    severity: 'high',
    implementationMode: 'partial-class-replacement',
    changedSlots: {
      overlay: `${miniappModalLayoutTokens.overlay} z-[120]`,
      panel: `${miniappModalLayoutTokens.panel} z-[121] max-w-md rounded-[2.5rem] border border-slate-200 bg-white shadow-2xl`,
      header: `${miniappModalLayoutTokens.header} flex items-center justify-between border-b border-slate-200 p-6`,
      body: `${miniappModalLayoutTokens.body} space-y-6 p-6`,
      footer: `${miniappModalLayoutTokens.footer} flex gap-4 border-t border-slate-200 bg-slate-50 px-6 pt-6`,
    },
  },
  {
    id: 'InfoModal',
    severity: 'medium',
    implementationMode: 'partial-class-replacement',
    changedSlots: {
      overlay: `${miniappModalLayoutTokens.overlay} z-[220]`,
      panel: `${miniappModalLayoutTokens.panel} max-w-sm rounded-[2rem] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#161d2a]`,
      header: `${miniappModalLayoutTokens.header} flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 p-6 dark:border-white/10 dark:bg-slate-900/40`,
      body: `${miniappModalLayoutTokens.body} p-6`,
      footer: `${miniappModalLayoutTokens.footer} px-6 pt-0`,
    },
  },
  {
    id: 'CheckoutModal',
    severity: 'medium',
    implementationMode: 'existing-shell-preserved',
    changedSlots: {
      header: `${miniappModalLayoutTokens.header} flex items-center justify-between border-b border-slate-200 bg-slate-50 p-6 dark:border-white/5 dark:bg-[#0B0F19]`,
      body: `${miniappModalLayoutTokens.body} space-y-6 p-6`,
    },
  },
  {
    id: 'SettlementModals.Result',
    severity: 'medium',
    implementationMode: 'existing-shell-preserved',
    changedSlots: {
      header:
        'flex shrink-0 items-center justify-between border-b border-slate-200 p-6 pb-2 md:p-8 dark:border-white/5',
      body: `${miniappModalLayoutTokens.body} p-6 md:p-8`,
      footer:
        'shrink-0 border-t border-slate-200 px-8 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1.25rem)] dark:border-white/5',
    },
  },
] as const;

function toClassSet(className: string): Set<string> {
  return new Set(className.split(/\s+/).filter((token) => token.length > 0));
}

function assertHasTokens(
  label: string,
  className: string,
  requiredTokens: readonly string[],
): void {
  const classSet = toClassSet(className);
  const missingTokens = requiredTokens.filter((token) => !classSet.has(token));

  if (missingTokens.length === 0) {
    return;
  }

  throw new Error(`${label} is missing tokens: ${missingTokens.join(', ')}`);
}

function assertDoesNotHaveTokens(
  label: string,
  className: string,
  disallowedTokens: readonly string[],
): void {
  const classSet = toClassSet(className);
  const blockedTokens = disallowedTokens.filter((token) => classSet.has(token));

  if (blockedTokens.length === 0) {
    return;
  }

  throw new Error(`${label} still has disallowed tokens: ${blockedTokens.join(', ')}`);
}

function assertSlotContract(
  patchId: string,
  slot: ModalSlot,
  className: string,
): void {
  if (slot === 'overlay') {
    assertHasTokens(`${patchId}.overlay`, className, REQUIRED_OVERLAY_TOKENS);
    return;
  }

  if (slot === 'panel') {
    assertHasTokens(`${patchId}.panel`, className, REQUIRED_PANEL_TOKENS);
    return;
  }

  if (slot === 'header') {
    assertHasTokens(`${patchId}.header`, className, REQUIRED_HEADER_TOKENS);
    return;
  }

  if (slot === 'body') {
    assertHasTokens(`${patchId}.body`, className, REQUIRED_BODY_TOKENS);
    assertDoesNotHaveTokens(`${patchId}.body`, className, DISALLOWED_BODY_TOKENS);
    return;
  }

  assertHasTokens(`${patchId}.footer`, className, REQUIRED_FOOTER_TOKENS);
}

function assertPatchContract(patch: ModalLayoutPatch): void {
  const entries = Object.entries(patch.changedSlots) as Array<[ModalSlot, string]>;

  if (entries.length === 0) {
    throw new Error(`${patch.id} has no class replacement target.`);
  }

  for (const [slot, className] of entries) {
    assertSlotContract(patch.id, slot, className);
  }
}

function getPatchesBySeverity(severity: ModalSeverity): readonly ModalLayoutPatch[] {
  return proposedPatches.filter((patch) => patch.severity === severity);
}

export function simulateHighRiskModalLayoutContract(): void {
  const highRiskPatches = getPatchesBySeverity('high');

  if (highRiskPatches.length !== 2) {
    throw new Error('High-risk modal count changed; update the remediation plan first.');
  }

  for (const patch of highRiskPatches) {
    if (Object.keys(patch.changedSlots).length !== 5) {
      throw new Error(`${patch.id} must replace overlay, panel, header, body, and footer.`);
    }
    assertPatchContract(patch);
  }
}

export function simulateMediumRiskModalLayoutContract(): void {
  const mediumRiskPatches = getPatchesBySeverity('medium');

  if (mediumRiskPatches.length !== 3) {
    throw new Error('Medium-risk modal count changed; update the remediation plan first.');
  }

  mediumRiskPatches.forEach(assertPatchContract);
}

export function simulateCheckoutViewportContract(): void {
  const checkoutPatch = proposedPatches.find((patch) => patch.id === 'CheckoutModal');

  if (checkoutPatch == null) {
    throw new Error('CheckoutModal patch is missing.');
  }

  if (checkoutPatch.changedSlots.overlay != null || checkoutPatch.changedSlots.panel != null) {
    throw new Error('CheckoutModal must preserve the existing TDSModal overlay/panel shell.');
  }

  const bodyClassName = checkoutPatch.changedSlots.body ?? '';
  assertDoesNotHaveTokens('CheckoutModal.body', bodyClassName, DISALLOWED_BODY_TOKENS);
}

export function simulateSettlementMinimalChangeContract(): void {
  const settlementPatch = proposedPatches.find(
    (patch) => patch.id === 'SettlementModals.Result',
  );

  if (settlementPatch == null) {
    throw new Error('SettlementModals.Result patch is missing.');
  }

  if (
    settlementPatch.changedSlots.overlay != null ||
    settlementPatch.changedSlots.panel != null
  ) {
    throw new Error('SettlementModals.Result must preserve existing overlay/panel classes.');
  }

  assertPatchContract(settlementPatch);
}

export function simulateNoOverEngineeringContract(): void {
  if (architectureDecision.shouldIntroduceSharedComponent) {
    throw new Error('A new shared component is outside the approved scope.');
  }

  if (architectureDecision.sharedTokenKeys.length !== 5) {
    throw new Error('Shared layout tokens should stay limited to overlay/panel/header/body/footer.');
  }

  if (architectureDecision.protectedRuntimeFiles.length !== 2) {
    throw new Error('Protected runtime shell files should not be part of this patch.');
  }

  const hasFullRewritePatch = proposedPatches.some(
    (patch) => patch.implementationMode !== 'partial-class-replacement' &&
      patch.implementationMode !== 'existing-shell-preserved',
  );

  if (hasFullRewritePatch) {
    throw new Error('Full JSX rewrites are not allowed for this launch patch.');
  }
}

export function simulatePostImplementationVerificationGate(): void {
  if (!postImplementationVerificationPlan.shouldImportRuntimeConstants) {
    throw new Error('Post-implementation tests must import runtime constants.');
  }

  if (runtimeFileContracts.length !== 6) {
    throw new Error('Post-implementation verification target list is incomplete.');
  }

  const contractPaths = new Set(runtimeFileContracts.map((contract) => contract.path));
  const requiredPaths = [
    'components/ui/constants.ts',
    'components/TradeExecutionModal.tsx',
    'components/QuickInputModal.tsx',
    'components/InfoModal.tsx',
    'components/CheckoutModal.tsx',
    'components/SettlementModals.tsx',
  ] as const;

  for (const requiredPath of requiredPaths) {
    if (!contractPaths.has(requiredPath)) {
      throw new Error(`Runtime verification is missing ${requiredPath}.`);
    }
  }

  const tradeContract = runtimeFileContracts.find(
    (contract) => contract.path === 'components/TradeExecutionModal.tsx',
  );
  const quickInputContract = runtimeFileContracts.find(
    (contract) => contract.path === 'components/QuickInputModal.tsx',
  );
  const checkoutContract = runtimeFileContracts.find(
    (contract) => contract.path === 'components/CheckoutModal.tsx',
  );
  const settlementContract = runtimeFileContracts.find(
    (contract) => contract.path === 'components/SettlementModals.tsx',
  );

  if (
    tradeContract == null ||
    !tradeContract.mustContain.includes('isExecutingTradeRef') ||
    !tradeContract.mustContain.includes('Promise.resolve(onSave(')
  ) {
    throw new Error('TradeExecutionModal async safety contract is incomplete.');
  }

  if (
    quickInputContract == null ||
    !quickInputContract.mustContain.includes('isExecutingTradeRef') ||
    !quickInputContract.mustContain.includes('Promise.resolve(onSave(')
  ) {
    throw new Error('QuickInputModal async safety contract is incomplete.');
  }

  if (
    checkoutContract == null ||
    !checkoutContract.mustContain.includes('isExecutingRef') ||
    !checkoutContract.mustContain.includes('await Promise.resolve(handleTossIapPay())') ||
    !checkoutContract.mustNotContain?.includes('max-h-[calc(100vh-8rem)]')
  ) {
    throw new Error('CheckoutModal runtime contract is incomplete.');
  }

  if (
    settlementContract == null ||
    !settlementContract.mustContain.includes('max-h-[calc(100dvh-2rem)]') ||
    !settlementContract.mustNotContain?.includes('MINIAPP_MODAL_LAYOUT')
  ) {
    throw new Error('SettlementModals minimal-change contract is incomplete.');
  }
}

export function simulateAllMiniappModalLayoutContracts(): void {
  proposedPatches.forEach(assertPatchContract);
  simulateCheckoutViewportContract();
  simulateSettlementMinimalChangeContract();
  simulateNoOverEngineeringContract();
  simulatePostImplementationVerificationGate();
}
