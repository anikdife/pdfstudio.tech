export type MobileFeatureId =
  | 'pages'
  | 'text'
  | 'image'
  | 'ink'
  | 'highlight'
  | 'list'
  | 'shape';

export type MobilePropertyGroupId =
  | 'none'
  | 'page'
  | 'text-style'
  | 'text-layout'
  | 'image-style'
  | 'image-adjust'
  | 'ink-style'
  | 'highlight-style'
  | 'list-style'
  | 'shape-style';

export const MOBILE_FEATURES: Array<{ id: MobileFeatureId; label: string }> = [
  { id: 'pages', label: 'Pages' },
  { id: 'text', label: 'Text' },
  { id: 'image', label: 'Image' },
  { id: 'ink', label: 'Ink' },
  { id: 'highlight', label: 'Highlight' },
  { id: 'list', label: 'List' },
  { id: 'shape', label: 'Shape' },
];

export function getPropertyGroupsForFeature(feature: MobileFeatureId): Array<{ id: MobilePropertyGroupId; label: string }> {
  switch (feature) {
    case 'pages':
      return [
        { id: 'none', label: 'Properties' },
        { id: 'page', label: 'Page' },
      ];
    case 'text':
      return [
        { id: 'none', label: 'Properties' },
        { id: 'text-style', label: 'Style' },
        { id: 'text-layout', label: 'Layout' },
      ];
    case 'image':
      return [
        { id: 'none', label: 'Properties' },
        { id: 'image-style', label: 'Style' },
        { id: 'image-adjust', label: 'Adjust' },
      ];
    case 'ink':
      return [
        { id: 'none', label: 'Properties' },
        { id: 'ink-style', label: 'Style' },
      ];
    case 'highlight':
      return [
        { id: 'none', label: 'Properties' },
        { id: 'highlight-style', label: 'Style' },
      ];
    case 'list':
      return [
        { id: 'none', label: 'Properties' },
        { id: 'list-style', label: 'Style' },
      ];
    case 'shape':
      return [
        { id: 'none', label: 'Properties' },
        { id: 'shape-style', label: 'Style' },
      ];
    default:
      return [{ id: 'none', label: 'Properties' }];
  }
}
