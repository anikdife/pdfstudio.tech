import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDocumentStore } from '../editor/state/documentStore';
import type { ResumeTemplateCard, ResumeTypeId } from '../resume/templates/registry';

function readType(search: string): ResumeTypeId {
  const t = new URLSearchParams(search).get('type') || 'modern-dark';
  if (t === 'modern-dark' || t === 'ats' || t === 'executive' || t === 'creative') return t;
  return 'modern-dark';
}

export default function ResumePage() {
  const navigate = useNavigate();
  const location = useLocation();

  const type = useMemo(() => readType(location.search), [location.search]);

  const [label, setLabel] = useState<string>('Resume');
  const [templates, setTemplates] = useState<ResumeTemplateCard[] | null>(null);
  const [loadingTemplateId, setLoadingTemplateId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTemplates(null);

    void (async () => {
      const mod = await import('../resume/templates/registry');
      if (cancelled) return;
      setLabel(mod.getResumeTypeLabel(type));
      setTemplates(mod.getResumeTemplatesByType(type));
    })();

    return () => {
      cancelled = true;
    };
  }, [type]);

  const openTemplate = async (tpl: ResumeTemplateCard) => {
    if (tpl.status !== 'implemented') return;

    setLoadingTemplateId(tpl.id);
    try {
      if (type === 'modern-dark' && tpl.id === 'glassy-dark-v1') {
        const { applyModernDarkResumeToEditor } = await import('../resume/templates/modernDark/buildModernDarkResumeDoc');
        await applyModernDarkResumeToEditor({
          store: useDocumentStore,
          title: 'Glassy Dark Resume',
        });
        navigate('/editor', { state: { preserveDoc: true } });
        return;
      }
    } finally {
      setLoadingTemplateId(null);
    }
  };

  return (
    <main className="homeBg homePage">
      <section className="home homeFlow" aria-label="Resume Templates">
        <div style={{ maxWidth: 980, margin: '0 auto', padding: '34px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: 1.4, fontWeight: 900, textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)' }}>
                Resume / CV
              </div>
              <h1 style={{ margin: '8px 0 0 0', fontSize: 28, fontWeight: 950, letterSpacing: '-0.6px' }}>{label}</h1>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <button type="button" className="pill pill-neutral pillLink" onClick={() => navigate('/pw')}>
                Back
              </button>
            </div>
          </div>

          <div style={{ marginTop: 14, color: 'rgba(255,255,255,0.66)', lineHeight: 1.45 }}>
            Choose a template to start editing in the PDF Studio canvas.
          </div>

          {templates == null ? (
            <div style={{ marginTop: 18, color: 'rgba(255,255,255,0.62)' }}>Loading templates…</div>
          ) : templates.length === 0 ? (
            <div
              style={{
                marginTop: 18,
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.06)',
                padding: 16,
                color: 'rgba(255,255,255,0.70)',
              }}
            >
              Templates coming soon.
            </div>
          ) : (
            <div
              style={{
                marginTop: 18,
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 12,
              }}
            >
              {templates.map((t) => {
                const disabled = t.status !== 'implemented' || loadingTemplateId === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void openTemplate(t)}
                    disabled={disabled}
                    className="pwResumeTile"
                    style={{
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      opacity: disabled ? 0.72 : 1,
                    }}
                    aria-label={t.status === 'implemented' ? `Open ${t.title}` : `${t.title} (coming soon)`}
                  >
                    <span className="pwResumeTileIcon" aria-hidden="true">
                      <span style={{ fontWeight: 950, fontSize: 12, color: 'rgba(226,232,240,0.92)' }}>
                        {t.status === 'implemented' ? '✓' : '…'}
                      </span>
                    </span>
                    <span>
                      <div className="pwResumeTileTitle">{t.title}</div>
                      <div className="pwResumeTileSub">{t.subtitle || (t.status === 'implemented' ? 'Implemented' : 'Coming soon')}</div>
                    </span>
                    <span className="pwResumeOpen">
                      {loadingTemplateId === t.id ? 'Opening…' : t.status === 'implemented' ? 'Open →' : 'Soon'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
