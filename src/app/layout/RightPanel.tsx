import { PropertiesPanel } from '../../editor/components/PropertiesPanel';
import { useUiStore } from '../../editor/state/uiStore';

export function RightPanel() {
  const propsOpen = useUiStore((s) => s.panels.propsOpen);
  const togglePanels = useUiStore((s) => s.togglePanels);
  const isMobile = useUiStore((s) => s.isMobile);

  if (isMobile && !propsOpen) return null;

  return (
    <aside className="rightPanel">
      <div className="panelHeader">
        <div>Properties Panel</div>
        <button type="button" onClick={() => togglePanels('propsOpen')}>Close</button>
      </div>
      <PropertiesPanel />
      {isMobile ? (
        <div className="panelFooter">
          <button type="button" onClick={() => togglePanels('propsOpen')}>Done</button>
        </div>
      ) : null}
    </aside>
  );
}
