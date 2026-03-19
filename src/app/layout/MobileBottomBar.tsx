import { ToolPicker } from '../../editor/components/ToolPicker';
import { useUiStore } from '../../editor/state/uiStore';

export function MobileBottomBar() {
  const togglePanels = useUiStore((s) => s.togglePanels);
  return (
    <div className="mobileBottomBar">
      <ToolPicker compact />
      <button type="button" onClick={() => togglePanels('propsOpen')}>Props</button>
    </div>
  );
}
