import { useUiStore } from '../state/uiStore';
import type { Tool } from '../state/types';

const tools: Array<{ tool: Tool; label: string }> = [
  { tool: 'pages', label: 'Pages' },
  { tool: 'image', label: 'Image' },
  { tool: 'ink', label: 'Ink' },
  { tool: 'highlight', label: 'Highlight' },
  { tool: 'text', label: 'Text' },
  { tool: 'link', label: 'Link' },
  { tool: 'list', label: 'List' },
  { tool: 'shape', label: 'Shape' },
];

export function ToolPicker({ compact }: { compact?: boolean }) {
  const tool = useUiStore((s) => s.tool);
  const setTool = useUiStore((s) => s.setTool);

  return (
    <div className={compact ? 'toolPicker compact' : 'toolPicker'}>
      {tools.map((t) => (
        <button
          key={t.tool}
          type="button"
          className={`button-30${tool === t.tool ? ' active' : ''}`}
          aria-pressed={tool === t.tool}
          onClick={() => setTool(t.tool)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
