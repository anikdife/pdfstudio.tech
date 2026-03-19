import { create } from 'zustand';
import type { ShapeType, Tool } from './types';
import { defaultExportStampSettings, type ExportStampSettings } from '../pageops/stamping';
import type { PageCrop } from './types';

type Panels = {
  thumbsOpen: boolean;
  propsOpen: boolean;
};

type ToolProps = {
  color: string;
  width: number;
  opacity: number;
  fontSize: number;
};

type UiState = {
  tool: Tool;
  toolProps: ToolProps;
  panels: Panels;
  isMobile: boolean;
  orbitLauncherOpen: boolean;
  filePickerOpen: boolean;
  imageUiStatus: string;
  imageUiStatusTick: number;
  selectedTextId: string | null;
  editingTextId: string | null;
  selectedImageId: string | null;
  selectedListId: string | null;
  editingListId: string | null;

  selectedShapeId: string | null;
  placementShapeType: ShapeType | null;
  // Used for variants like speech bubble tail direction.
  placementShapeVariant: string | null;

  // Generic selection state (Phase 1 for List tool; kept in sync with existing fields).
  selectedObjId: string | null;
  selectedObjType: 'text' | 'image' | 'list' | null;
  editingObjId: string | null;

  selectedPageIndices: number[];
  pageSelectionAnchor: number | null;

  cropMode: boolean;
  cropDraftByPage: Record<number, PageCrop>;

  exportStamps: ExportStampSettings;

  linkDestPick:
    | {
        linkId: string;
        destPageIndex: number;
        returnTool: Tool;
      }
    | null;

  setTool: (tool: Tool) => void;
  setToolProp: <K extends keyof ToolProps>(key: K, value: ToolProps[K]) => void;
  togglePanels: (key: keyof Panels) => void;
  setIsMobile: (isMobile: boolean) => void;
  setOrbitLauncherOpen: (open: boolean) => void;
  setFilePickerOpen: (open: boolean) => void;
  setImageUiStatus: (text: string) => void;
  setSelectedTextId: (id: string | null) => void;
  setEditingTextId: (id: string | null) => void;
  setSelectedImageId: (id: string | null) => void;
  setSelectedListId: (id: string | null) => void;
  setEditingListId: (id: string | null) => void;

  setSelectedShapeId: (id: string | null) => void;
  setPlacementShapeType: (shapeType: ShapeType | null) => void;
  setPlacementShapeVariant: (variant: string | null) => void;
  clearPlacementShapeType: () => void;

  setSelectedPageIndices: (indices: number[]) => void;
  setPageSelectionAnchor: (index: number | null) => void;
  togglePageSelected: (index: number) => void;
  clearPageSelection: () => void;

  setCropMode: (enabled: boolean) => void;
  setCropDraft: (pageIndex: number, crop: PageCrop) => void;
  clearCropDraft: (pageIndex: number) => void;

  patchExportStamps: (patch: Partial<ExportStampSettings>) => void;

  setLinkDestPick: (pick: UiState['linkDestPick']) => void;
};

export const useUiStore = create<UiState>((set) => ({
  tool: 'image',
  toolProps: {
    color: '#e11d48',
    width: 2,
    opacity: 0.35,
    fontSize: 14,
  },
  panels: {
    thumbsOpen: true,
    propsOpen: false,
  },
  isMobile: false,
  orbitLauncherOpen: false,
  filePickerOpen: false,
  imageUiStatus: '',
  imageUiStatusTick: 0,
  selectedTextId: null,
  editingTextId: null,
  selectedImageId: null,
  selectedListId: null,
  editingListId: null,

  selectedShapeId: null,
  placementShapeType: null,
  placementShapeVariant: null,

  selectedObjId: null,
  selectedObjType: null,
  editingObjId: null,

  selectedPageIndices: [],
  pageSelectionAnchor: null,

  cropMode: false,
  cropDraftByPage: {},

  exportStamps: defaultExportStampSettings(),

  linkDestPick: null,

  setTool: (tool) =>
    set((s) => {
      const next: UiState = {
        ...s,
        tool,
        panels: {
          ...s.panels,
          // Thumbnails panel is always present.
          thumbsOpen: true,
          // Keep current Properties panel state (mobile uses the "Props" button).
          propsOpen: s.panels.propsOpen,
        },
      };

      // Switching tools should not leave unrelated overlay selections active.
      // (Prevents e.g. highlight gestures being blocked by a selected textbox.)
      if (tool === 'pages' || tool === 'highlight' || tool === 'ink') {
        next.selectedTextId = null;
        next.editingTextId = null;
        next.selectedImageId = null;
        next.selectedListId = null;
        next.editingListId = null;
        next.selectedObjId = null;
        next.selectedObjType = null;
        next.editingObjId = null;

        next.selectedShapeId = null;
        next.placementShapeType = null;
        next.placementShapeVariant = null;
      } else if (tool === 'text') {
        next.selectedImageId = null;
        next.selectedListId = null;
        if (next.selectedObjType === 'image' || next.selectedObjType === 'list') {
          next.selectedObjId = null;
          next.selectedObjType = null;
        }
      } else if (tool === 'image') {
        next.selectedTextId = null;
        next.editingTextId = null;
        next.selectedListId = null;
        next.editingListId = null;
        if (next.selectedObjType === 'text' || next.selectedObjType === 'list') {
          next.selectedObjId = null;
          next.selectedObjType = null;
        }
        if (next.editingObjId) next.editingObjId = null;
      } else if (tool === 'list') {
        next.selectedTextId = null;
        next.editingTextId = null;
        next.selectedImageId = null;
        if (next.selectedObjType === 'text' || next.selectedObjType === 'image') {
          next.selectedObjId = null;
          next.selectedObjType = null;
        }
      }

      if (tool === 'shape') {
        // Shape tool uses its own selection; clear other overlay selections so right panel is unambiguous.
        next.selectedTextId = null;
        next.editingTextId = null;
        next.selectedImageId = null;
        next.selectedListId = null;
        next.editingListId = null;
        next.selectedObjId = null;
        next.selectedObjType = null;
        next.editingObjId = null;
      } else {
        // Leaving shape tool: clear placement/selection so other tools are unaffected.
        next.selectedShapeId = null;
        next.placementShapeType = null;
        next.placementShapeVariant = null;
      }

      return next;
    }),

  setLinkDestPick: (pick) => set((s) => ({ ...s, linkDestPick: pick })),

  setOrbitLauncherOpen: (open) => set((s) => ({ ...s, orbitLauncherOpen: open })),
  setFilePickerOpen: (open) => set((s) => ({ ...s, filePickerOpen: open })),
  setImageUiStatus: (text) =>
    set((s) => ({
      ...s,
      imageUiStatus: text,
      imageUiStatusTick: s.imageUiStatusTick + 1,
    })),
  setToolProp: (key, value) =>
    set((s) => ({
      ...s,
      toolProps: { ...s.toolProps, [key]: value },
    })),
  togglePanels: (key) =>
    set((s) => ({
      ...s,
      panels: { ...s.panels, [key]: !s.panels[key] },
    })),
  setIsMobile: (isMobile) => set((s) => ({ ...s, isMobile })),
  setSelectedTextId: (id) =>
    set((s) => ({
      ...s,
      selectedTextId: id,
      ...(id
        ? { selectedObjId: id, selectedObjType: 'text' as const }
        : s.selectedObjType === 'text'
          ? { selectedObjId: null, selectedObjType: null }
          : null),
    })),
  setEditingTextId: (id) =>
    set((s) => ({
      ...s,
      editingTextId: id,
      ...(id ? { editingObjId: id } : s.editingObjId === s.editingTextId ? { editingObjId: null } : null),
    })),
  setSelectedImageId: (id) =>
    set((s) => ({
      ...s,
      selectedImageId: id,
      ...(id
        ? { selectedObjId: id, selectedObjType: 'image' as const }
        : s.selectedObjType === 'image'
          ? { selectedObjId: null, selectedObjType: null }
          : null),
    })),
  setSelectedListId: (id) =>
    set((s) => ({
      ...s,
      selectedListId: id,
      ...(id
        ? { selectedObjId: id, selectedObjType: 'list' as const }
        : s.selectedObjType === 'list'
          ? { selectedObjId: null, selectedObjType: null }
          : null),
    })),
  setEditingListId: (id) =>
    set((s) => ({
      ...s,
      editingListId: id,
      ...(id ? { editingObjId: id } : s.editingObjId === s.editingListId ? { editingObjId: null } : null),
    })),

  setSelectedShapeId: (id) => set((s) => ({ ...s, selectedShapeId: id })),
  setPlacementShapeType: (shapeType) => set((s) => ({ ...s, placementShapeType: shapeType })),
  setPlacementShapeVariant: (variant) => set((s) => ({ ...s, placementShapeVariant: variant })),
  clearPlacementShapeType: () => set((s) => ({ ...s, placementShapeType: null, placementShapeVariant: null })),

  setSelectedPageIndices: (indices) => set((s) => ({ ...s, selectedPageIndices: indices })),
  setPageSelectionAnchor: (index) => set((s) => ({ ...s, pageSelectionAnchor: index })),
  togglePageSelected: (index) =>
    set((s) => {
      const setIdx = new Set(s.selectedPageIndices);
      if (setIdx.has(index)) setIdx.delete(index);
      else setIdx.add(index);
      return { ...s, selectedPageIndices: Array.from(setIdx).sort((a, b) => a - b) };
    }),
  clearPageSelection: () => set((s) => ({ ...s, selectedPageIndices: [], pageSelectionAnchor: null })),

  setCropMode: (enabled) => set((s) => ({ ...s, cropMode: enabled })),
  setCropDraft: (pageIndex, crop) =>
    set((s) => ({ ...s, cropDraftByPage: { ...s.cropDraftByPage, [pageIndex]: crop } })),
  clearCropDraft: (pageIndex) =>
    set((s) => {
      const next = { ...s.cropDraftByPage };
      delete next[pageIndex];
      return { ...s, cropDraftByPage: next };
    }),

  patchExportStamps: (patch) =>
    set((s) => ({
      ...s,
      exportStamps: {
        ...s.exportStamps,
        ...patch,
        pageNumbers: { ...s.exportStamps.pageNumbers, ...(patch.pageNumbers ?? {}) },
        watermark: { ...s.exportStamps.watermark, ...(patch.watermark ?? {}) },
      },
    })),
}));
