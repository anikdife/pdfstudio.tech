import { ThumbnailList } from '../../editor/components/ThumbnailList';

export function LeftPanel() {
  return (
    <aside className="leftPanel">
      <div className="panelHeader">
        <div>Thumbnail Panel</div>
      </div>
      <ThumbnailList />
    </aside>
  );
}

