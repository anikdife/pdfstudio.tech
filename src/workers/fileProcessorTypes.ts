export type ParserKind = 'doc' | 'sheet' | 'text';

export type ParserPage =
  | { kind: 'html'; title?: string; html: string }
  | { kind: 'json'; title?: string; json: unknown };

export type ParsedImageMeta = {
  id: string;
  contentType: string;
  base64: string;
  // Best-effort position hint. For DOCX this is the encounter order.
  position?:
    | { type: 'order'; index: number }
    | { type: 'page'; pageIndex: number; index: number };
};

export type ParserResult = {
  kind: ParserKind;
  pages: ParserPage[];
  title?: string;
  images?: ParsedImageMeta[];
  warnings?: string[];
};

export type WorkerParseRequest = {
  type: 'parse';
  requestId: string;
  fileName: string;
  extension: string;
  buffer: ArrayBuffer;
};

export type WorkerParseResponse =
  | { type: 'result'; requestId: string; result: ParserResult }
  | { type: 'error'; requestId: string; error: { message: string; stack?: string } };
