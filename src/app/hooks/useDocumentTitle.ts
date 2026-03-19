import { useEffect, useMemo, useState } from 'react';
import { useDocumentStore } from '../../editor/state/documentStore';

const DEFAULT_TITLE = 'PDF Studio | The Private Workstation';
const INACTIVE_TITLE = '🔒 Your Privacy is Safe | pdfstudio.tech';

function getDocDisplayName(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 0 ? trimmed : 'Untitled';
}

/**
 * Keeps `document.title` in sync with editor state and tab focus.
 *
 * - Default: 'PDF Studio | The Private Workstation'
 * - When a file/doc is open: '📄 {fileName} - PDF Studio'
 * - When tab is inactive (blur/hidden): '🔒 Your Privacy is Safe | pdfstudio.tech'
 */
export function useDocumentTitle() {
  const docTitle = useDocumentStore((s) => s.doc?.meta?.title ?? null);
  const hasDocOpen = useDocumentStore((s) => !!s.doc);

  const [inactive, setInactive] = useState<boolean>(() => {
    try {
      return typeof document !== 'undefined' ? document.hidden : false;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const onBlur = () => setInactive(true);
    const onFocus = () => setInactive(false);
    const onVisibilityChange = () => setInactive(document.hidden);

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  const activeTitle = useMemo(() => {
    if (!hasDocOpen || !docTitle) return DEFAULT_TITLE;
    return `📄 ${getDocDisplayName(docTitle)} - PDF Studio`;
  }, [docTitle, hasDocOpen]);

  useEffect(() => {
    document.title = inactive ? INACTIVE_TITLE : activeTitle;
  }, [activeTitle, inactive]);
}
