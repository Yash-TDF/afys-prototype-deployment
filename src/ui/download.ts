// Saving a file, and copying a link.
//
// These are the genuinely generic parts of the approved prototype's export row —
// the rest of it is branded ("African Youth Survey", "afys.vercel.app", a
// hardcoded a/b/d column order) and does not survive the port. Two details in
// here are worth keeping deliberately, because our own version had neither:
//
//   - The link is put in the document before it is clicked. Firefox ignores
//     click() on an anchor that is not in the tree, so the download silently
//     does nothing.
//   - The object URL is revoked on a timer rather than immediately. Safari has
//     not finished reading the blob when click() returns, and revoking at once
//     produces an empty file.

/** A filename fragment: lowercase, punctuation collapsed to underscores. */
export const slug = (value: string): string =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

/** A CSV field, quoted only where it has to be. */
export const csvEscape = (value: unknown): string => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function downloadBlob(content: string, type: string, name: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  saveAs(url, name);
  window.setTimeout(() => URL.revokeObjectURL(url), 500);
}

/** For an href that is already a URL — a canvas data URL, say. */
export function saveAs(href: string, name: string): void {
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Copy text, preferring the modern API.
 *
 * The clipboard API needs a secure context and can be refused, and this prototype
 * is opened over plain http on a laptop as often as over https — so the old
 * textarea trick stays as the fallback rather than letting the button do nothing.
 */
export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Refused, or not permitted here. Fall through.
    }
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  let copied = false;
  try {
    // Deprecated, and the only thing that works without a secure context.
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();
  return copied;
}
