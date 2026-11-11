// Economy's own modals (asset form, asset detail, manual gold) cover the tab and blur it.
// Opening one of them must not re-lock Economy; leaving to another tab must.
let openedOwnModal = false;

export function markEconomyModal(): void {
  openedOwnModal = true;
}

export function consumeEconomyModal(): boolean {
  const kept = openedOwnModal;
  openedOwnModal = false;
  return kept;
}
