/**
 * Browser save slots. Storage can be blocked (private windows, strict
 * settings), so every call is wrapped and the game works without it.
 */

export const AUTOSAVE_KEY = 'cwgs.save.autosave';
export const MANUAL_SAVE_KEY = 'cwgs.save.slot1';

export function readSlot(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeSlot(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function downloadText(fileName: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
