export type PageRotation = 0 | 90 | 180 | 270;

export type Tool = 'pages' | 'image' | 'ink' | 'highlight' | 'text' | 'link' | 'list' | 'shape';

export type LinkKind = 'external' | 'internal';

export type LinkTarget =
  | { kind: 'external'; url: string }
  | { kind: 'internal'; pageIndex: number; x?: number; y?: number; zoom?: number };

export type LinkRect = { x: number; y: number; w: number; h: number }; // points, origin = top-left, unrotated

export type LinkMark = {
  id: string;
  pageIndex: number; // editor page index
  rect: LinkRect;
  target: LinkTarget;
  // If false, do not render any visible label for this link.
  // Export defaults to showing external URL text when this is undefined.
  showLabel?: boolean;
  label?: string;
  createdAt?: number;
  updatedAt?: number;
};

export type ShapeType =
  | 'rect'
  | 'roundRect'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'polygon'
  | 'star'
  | 'line'
  | 'arrow'
  | 'doubleArrow'
  | 'curvedArrow'
  | 'connector'
  | 'process'
  | 'decision'
  | 'terminator'
  | 'document'
  | 'database'
  | 'inputOutput'
  | 'speechBubble'
  | 'labelTag'
  | 'pointerCallout'
  | 'ribbon'
  | 'seal'
  | 'banner';

export type ShapeStyle = {
  fill: string | 'none';
  stroke: string;
  strokeWidth: number;
  opacity: number;
};

export type ShapeObj = {
  id: string;
  type: 'shape';
  shapeType: ShapeType;
  // Optional variants (e.g. speech bubble tail direction).
  variant?: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  style: ShapeStyle;
  zIndex: number;
  locked?: boolean;
};

export type Rect = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };

export type InkObj = {
  id: string;
  type: 'ink';
  color: string;
  width: number;
  opacity: number;
  points: Pt[];
};

export type HighlightObj = {
  id: string;
  type: 'highlight';
  color: string;
  opacity: number;
  rect: Rect;
};

export type ShapeMask =
  | { type: 'none' }
  | { type: 'rect'; radius: number }
  | { type: 'circle' }
  | { type: 'ellipse' }
  | { type: 'triangle'; direction: 'up' }
  | { type: 'diamond' }
  | { type: 'hexagon' }
  | { type: 'polygon'; sides: number }
  | { type: 'star'; points: 5; innerRatio: number }
  | { type: 'bubble'; tail: 'bottom' }
  | { type: 'heart' };

export type ImageObj = {
  id: string;
  type: 'image';
  src: string; // data URL
  name?: string;
  // Legacy (kept for backward compatibility): prefer `filters.contrast`.
  contrast?: number; // 1 = 100%
  opacity?: number; // 0..1
  borderRadius?: number; // px
  mask?: ShapeMask;
  transform?: {
    flipX?: boolean;
    flipY?: boolean;
    skewX?: number; // degrees
    skewY?: number; // degrees
  };
  filters?: {
    brightness?: number; // 1 = 100%
    contrast?: number; // 1 = 100%
    saturation?: number; // 1 = 100%
    grayscale?: number; // 0..1
    sepia?: number; // 0..1
    invert?: number; // 0..1
  };
  crop?: {
    l: number; // 0..1 fraction
    t: number;
    r: number;
    b: number;
  };
  rect: Rect;
};

export type TextObj = {
  id: string;
  type: 'text';
  text: string;
  color: string;
  fontSize: number;
  background?: string; // css color or 'transparent'
  border?: {
    color?: string;
    width?: number;
    style?: 'dotted' | 'dashed' | 'solid' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset' | 'none';
  };
  font?: {
    family: string;
    size: number;
    bold?: boolean;
    italic?: boolean;
  };
  strike?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  rect: Rect;
};

export type ListItem = {
  id: string;
  text: string;
  indentLevel: number;
  checked?: boolean;
};

export type ListType =
  | 'bullet'
  | 'filled-circle'
  | 'hollow-circle'
  | 'circle'
  | 'square'
  | 'dash'
  | 'number'
  | 'upper-alpha'
  | 'lower-alpha'
  | 'upper-roman'
  | 'lower-roman'
  | 'checkbox';

export type ListObj = {
  id: string;
  type: 'list';
  items: ListItem[];
  listType: ListType;
  startNumber: number;
  indentSize: number;

  color: string;
  fontSize: number;
  font?: {
    family: string;
    size: number;
    bold?: boolean;
    italic?: boolean;
  };
  strike?: boolean;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;

  rect: Rect;
};

export type BorderStyle =
  | 'corporate'
  | 'modern-accent'
  | 'classic-frame'
  | 'minimalist'
  | 'ornate-corners'
  | 'floral-spectrum'
  | 'vintage-banner'
  | 'gold-frame'
  | 'doodle'
  | 'wave';

export type PageBorderObj = {
  id: string;
  type: 'pageBorder';
  style: BorderStyle;
  color?: string;
  strokeWidth?: number;
};

export type PageBackgroundObj = {
  id: string;
  type: 'pageBackground';
  src: string; // data URL
  opacity?: number; // 0..1
};

export type OverlayObject = InkObj | HighlightObj | TextObj | ImageObj | ListObj | ShapeObj | PageBorderObj | PageBackgroundObj;

export type OverlayPage = {
  objects: OverlayObject[];
};

export type PageCrop = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type Op =
  | {
      type: 'overlay/add';
      pageIndex: number;
      object: OverlayObject;
    }
  | {
      type: 'overlay/update';
      pageIndex: number;
      objectId: string;
      patch: Partial<OverlayObject>;
      before: OverlayObject;
      after: OverlayObject;
    }
  | {
      type: 'overlay/remove';
      pageIndex: number;
      object: OverlayObject;
    }
  | {
      type: 'page/reorder';
      from: number;
      to: number;
      beforeOrder: number[];
      afterOrder: number[];
    }
  | {
      type: 'page/rotate';
      pageIndex: number;
      before: PageRotation;
      after: PageRotation;
    }
  | {
      type: 'page/delete';
      pageIndex: number;
      deletedOriginalPageIndex: number;
    };

export type PdfDocModel = {
  id: string;
  meta: {
    title: string;
    createdAt: number;
    updatedAt: number;
  };

  basePdfBytes?: Uint8Array;

  /**
   * Explicit page size metadata in PDF points (1/72 inch).
   * Backward-compatible: if missing, fall back to `pageSizes`.
   */
  pageSizePoints?: Array<{
    widthPoints: number;
    heightPoints: number;
    sourceSizeType?: 'inferred' | 'preset' | 'custom' | 'image';
    presetId?: string | null;
  }>;

  /** Default page size used when inserting new blank pages. */
  defaultPageSizePoints?: {
    widthPoints: number;
    heightPoints: number;
    presetId?: string | null;
  };

  pageCount: number;
  pageSizes: Array<{ w: number; h: number }>;
  pageRotation: PageRotation[];
  pageCrop?: Array<PageCrop | null>;
  pageOrder: number[]; // editor index -> original page index

  overlays: Record<number, OverlayPage>; // keyed by editor page index

  linksByPage: Record<number, LinkMark[]>; // keyed by editor page index

  ops: Op[];
  undo: Op[];
  redo: Op[];
};
