import type {
  AnnotationContext,
  ContextSettings,
  ContextMode,
  TextSpan
} from '../domain/annotationContext';

export const ANNOTATION_STYLE_IDS = [
  'yellow',
  'green',
  'blue',
  'pink',
  'underline',
  'dotted',
  'dashed',
  'double',
  'lowlight'
] as const;
export type AnnotationStyleId = (typeof ANNOTATION_STYLE_IDS)[number];

export const DEFAULT_ANNOTATION_STYLE: AnnotationStyleId = 'yellow';
export const ANNOTATION_NOTE_LIMIT = 2000;

export const CONTEXT_MENU_ID = 'annotatee.annotate-selection';
export const CONTEXT_RANGE_LIMIT = {
  max: 12,
  min: 0
};
export const CONTEXT_MODES: ContextMode[] = ['words', 'sentence', 'paragraph'];

export const DEFAULT_CONTEXT_SETTINGS: ContextSettings = {
  mode: 'sentence',
  range: 1
};

export interface CopySettings {
  customText: string;
}

export interface UserSettings {
  context: ContextSettings;
  copy: CopySettings;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  context: DEFAULT_CONTEXT_SETTINGS,
  copy: {
    customText: ''
  }
};

export interface ArticleMetadata {
  areaLabel: string;
  articleTitle: string;
  excerpt?: string;
  pageKey: string;
  pageTitle: string;
  pageUrl: string;
  readerable: boolean;
  siteName?: string;
}

export interface StoredAnnotation {
  context: AnnotationContext;
  createdAt: string;
  id: string;
  note: string;
  pageKey: string;
  pageTitle: string;
  pageUrl: string;
  siteName?: string;
  span: TextSpan;
  style: AnnotationStyleId;
  updatedAt: string;
}

export interface ExtensionState {
  annotations: StoredAnnotation[];
  article?: ArticleMetadata;
  enabled: boolean;
  reason?: string;
  settings: UserSettings;
}

export type ContentRequest =
  | {
      type: 'ANNOTATE_SELECTION';
      selectionText?: string;
    }
  | {
      type: 'UPDATE_SETTINGS';
      settings: UserSettings;
    }
  | {
      type: 'DELETE_ANNOTATION';
      id: string;
    }
  | {
      type: 'UPDATE_ANNOTATION_NOTE';
      id: string;
      note: string;
    }
  | {
      type: 'GET_STATE';
    };

export type StateChangedMessage = {
  state: ExtensionState;
  type: 'STATE_CHANGED';
};

export type AnnotateSelectionResponse =
  | {
      annotation: StoredAnnotation;
      ok: true;
      state: ExtensionState;
    }
  | {
      ok: false;
      reason: string;
      state: ExtensionState;
    };

export type DeleteAnnotationResponse =
  | {
      ok: true;
      state: ExtensionState;
    }
  | {
      ok: false;
      reason: string;
      state: ExtensionState;
    };

export type UpdateAnnotationNoteResponse =
  | {
      annotation: StoredAnnotation;
      ok: true;
      state: ExtensionState;
    }
  | {
      ok: false;
      reason: string;
      state: ExtensionState;
    };

export type UpdateSettingsResponse = {
  ok: true;
  state: ExtensionState;
};

export type ContentResponse =
  | AnnotateSelectionResponse
  | DeleteAnnotationResponse
  | UpdateAnnotationNoteResponse
  | UpdateSettingsResponse
  | ExtensionState;

export function normalizeUserSettings(value: unknown): UserSettings {
  const record = isRecord(value) ? value : {};
  const copy = isRecord(record.copy) ? record.copy : {};

  return {
    context: normalizeContextSettings(record.context),
    copy: {
      customText:
        typeof copy.customText === 'string'
          ? copy.customText
          : DEFAULT_USER_SETTINGS.copy.customText
    }
  };
}

export function normalizeAnnotationStyle(value: unknown): AnnotationStyleId {
  return isAnnotationStyleId(value) ? value : DEFAULT_ANNOTATION_STYLE;
}

export function normalizeAnnotationNote(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/\r\n?/g, '\n').trim().slice(0, ANNOTATION_NOTE_LIMIT)
    : '';
}

export function normalizeContextSettings(value: unknown): ContextSettings {
  const record = isRecord(value) ? value : {};
  const mode = isContextMode(record.mode) ? record.mode : DEFAULT_CONTEXT_SETTINGS.mode;
  const numericRange = Number(record.range);
  const range = Number.isFinite(numericRange)
    ? Math.round(numericRange)
    : DEFAULT_CONTEXT_SETTINGS.range;

  return {
    mode,
    range: clamp(range, CONTEXT_RANGE_LIMIT.min, CONTEXT_RANGE_LIMIT.max)
  };
}

function isAnnotationStyleId(value: unknown): value is AnnotationStyleId {
  return typeof value === 'string' && ANNOTATION_STYLE_IDS.includes(value as AnnotationStyleId);
}

function isContextMode(value: unknown): value is ContextMode {
  return typeof value === 'string' && CONTEXT_MODES.includes(value as ContextMode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
