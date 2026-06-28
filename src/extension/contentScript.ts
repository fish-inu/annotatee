import {
  UserSelectAction,
  createTextAnnotator,
  type HighlightStyle,
  type TextAnnotation,
  type TextAnnotator
} from '@recogito/text-annotator';
import { getContext, type ContextSettings, type TextSpan } from '../domain/annotationContext';
import { detectReadableArticle, type ReadableArticleTarget } from './readability';
import { isContentRequest } from './messages';
import {
  ANNOTATION_STYLE_IDS,
  DEFAULT_ANNOTATION_STYLE,
  DEFAULT_USER_SETTINGS,
  normalizeAnnotationStyle,
  type AnnotationStyleId,
  type AnnotateSelectionResponse,
  type ArticleTextResponse,
  type ContentRequest,
  type DeleteAnnotationResponse,
  type ExtensionState,
  type StoredAnnotation,
  type UpdateSettingsResponse,
  type UserSettings
} from './types';
import {
  deleteStoredAnnotation,
  getAnnotationsForPage,
  getUserSettings,
  writeUserSettings,
  upsertStoredAnnotation
} from './storage';

interface SelectionSnapshot {
  end: number;
  quote: string;
  range: Range;
  start: number;
}

const ARTICLE_ROOT_CLASS = 'annotatee-article-root';
const EMPTY_STATE_REASON = 'No readable article area detected on this page.';
const ANNOTATION_STYLE_PROPERTY = 'annotateeStyle';
const ANNOTATION_STYLE_PRESETS: Record<
  AnnotationStyleId,
  {
    highlight: HighlightStyle;
    label: string;
    swatch: string;
  }
> = {
  blue: {
    highlight: {
      fill: '#93c5fd',
      fillOpacity: 0.52,
      underlineColor: '#2563eb',
      underlineThickness: 2
    },
    label: 'Blue',
    swatch: '#60a5fa'
  },
  green: {
    highlight: {
      fill: '#86efac',
      fillOpacity: 0.5,
      underlineColor: '#15803d',
      underlineThickness: 2
    },
    label: 'Green',
    swatch: '#4ade80'
  },
  pink: {
    highlight: {
      fill: '#f9a8d4',
      fillOpacity: 0.5,
      underlineColor: '#be185d',
      underlineThickness: 2
    },
    label: 'Pink',
    swatch: '#f472b6'
  },
  underline: {
    highlight: {
      fill: 'transparent',
      fillOpacity: 0,
      underlineColor: '#7c3aed',
      underlineThickness: 3
    },
    label: 'Underline',
    swatch: '#8b5cf6'
  },
  yellow: {
    highlight: {
      fill: '#f4c84a',
      fillOpacity: 0.56,
      underlineColor: '#946200',
      underlineThickness: 2
    },
    label: 'Yellow',
    swatch: '#f4c84a'
  }
};

class ArticleAnnotationController {
  private annotations: StoredAnnotation[] = [];
  private articleTarget: ReadableArticleTarget | null = null;
  private annotator: TextAnnotator<TextAnnotation> | null = null;
  private activePopoverId: string | null = null;
  private activeSelection: SelectionSnapshot | null = null;
  private lastSelection: SelectionSnapshot | null = null;
  private popover: HTMLElement | null = null;
  private popoverActionButton: HTMLButtonElement | null = null;
  private popoverQuote: HTMLElement | null = null;
  private popoverStyleButtons: HTMLButtonElement[] = [];
  private popoverStylePicker: HTMLElement | null = null;
  private selectedStyle: AnnotationStyleId = DEFAULT_ANNOTATION_STYLE;
  private settings: UserSettings = DEFAULT_USER_SETTINGS;
  private toast: HTMLElement | null = null;
  private toastTimer = 0;

  async start() {
    this.bindMessages();
    this.settings = await getUserSettings();
    this.articleTarget = detectReadableArticle();

    if (!this.articleTarget) {
      return;
    }

    this.articleTarget.root.classList.add(ARTICLE_ROOT_CLASS);
    this.annotator = createTextAnnotator<TextAnnotation, TextAnnotation>(this.articleTarget.root, {
      annotatingEnabled: false,
      renderer: 'SPANS',
      style: getAnnotationHighlightStyle,
      userSelectAction: UserSelectAction.SELECT
    });
    this.annotator.on('clickAnnotation', (annotation, event) => {
      this.showPopover(annotation, event);
    });

    await this.loadPageAnnotations();
    this.bindSelectionCapture();
    this.bindDismissHandlers();
  }

  private bindMessages() {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isContentRequest(message)) {
        return false;
      }

      void this.handleMessage(message).then(sendResponse);
      return true;
    });
  }

  private async handleMessage(
    message: ContentRequest
  ): Promise<
    AnnotateSelectionResponse | ArticleTextResponse | DeleteAnnotationResponse | ExtensionState | UpdateSettingsResponse
  > {
    if (message.type === 'GET_STATE') {
      return this.getState();
    }

    if (message.type === 'GET_ARTICLE_TEXT') {
      return this.getArticleText();
    }

    if (message.type === 'UPDATE_SETTINGS') {
      return this.updateSettings(message.settings);
    }

    if (message.type === 'DELETE_ANNOTATION') {
      return this.deleteAnnotation(message.id);
    }

    return this.annotateCurrentSelection(message.selectionText);
  }

  private async loadPageAnnotations() {
    const target = this.requireArticleTarget();
    this.annotations = await getAnnotationsForPage(target.metadata.pageKey);
    this.annotator?.setAnnotations(this.annotations.map(toTextAnnotation), true);
  }

  private bindSelectionCapture() {
    this.articleTarget?.root.addEventListener('dblclick', (event) => {
      const fallbackRect = pointToRect(event.clientX, event.clientY);

      window.setTimeout(() => {
        this.showSelectionPopoverFromCurrentSelection(fallbackRect);
      });
    });

    document.addEventListener('selectionchange', () => {
      const snapshot = this.getCurrentSelectionSnapshot();

      if (snapshot) {
        this.lastSelection = snapshot;
      }
    });

    document.addEventListener(
      'contextmenu',
      () => {
        const snapshot = this.getCurrentSelectionSnapshot();

        if (snapshot) {
          this.lastSelection = snapshot;
        }
      },
      true
    );
  }

  private bindDismissHandlers() {
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.popover || this.popover.hidden) {
          return;
        }

        if (event.target instanceof Node && this.popover.contains(event.target)) {
          return;
        }

        this.hidePopover();
      },
      true
    );

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.hidePopover();
      }
    });

    window.addEventListener('scroll', () => this.hidePopover(), true);
    window.addEventListener('resize', () => this.hidePopover());
  }

  private async annotateCurrentSelection(
    menuSelectionText?: string
  ): Promise<AnnotateSelectionResponse> {
    if (!this.articleTarget || !this.annotator) {
      return this.failedAnnotation(EMPTY_STATE_REASON);
    }

    const snapshot = this.getCurrentSelectionSnapshot() ?? this.lastSelection;

    if (!snapshot) {
      return this.failedAnnotation('Select article text before annotating.');
    }

    return this.annotateSnapshot(snapshot, menuSelectionText);
  }

  private async annotateSnapshot(
    snapshot: SelectionSnapshot,
    menuSelectionText?: string
  ): Promise<AnnotateSelectionResponse> {
    if (!this.articleTarget || !this.annotator) {
      return this.failedAnnotation(EMPTY_STATE_REASON);
    }

    const normalizedMenuText = normalizeWhitespace(menuSelectionText ?? '');
    const normalizedQuote = normalizeWhitespace(snapshot.quote);

    if (normalizedMenuText && normalizedQuote && normalizedMenuText !== normalizedQuote) {
      return this.failedAnnotation('The selected text changed before it could be annotated.');
    }

    const duplicate = this.annotations.find(
      (annotation) =>
        annotation.span.start === snapshot.start &&
        annotation.span.end === snapshot.end &&
        annotation.span.text === snapshot.quote
    );

    if (duplicate) {
      this.showToast('Already annotated');
      return {
        annotation: duplicate,
        ok: true,
        state: this.getState()
      };
    }

    const annotation = this.createStoredAnnotation(snapshot);
    this.annotator.addAnnotation(toTextAnnotation(annotation));

    if (!this.annotator.getAnnotationById(annotation.id)) {
      return this.failedAnnotation('The selected text could not be anchored in the article.');
    }

    await upsertStoredAnnotation(annotation);
    this.annotations = [
      ...this.annotations,
      annotation
    ].sort((first, second) => first.span.start - second.span.start);

    document.getSelection()?.removeAllRanges();
    this.hidePopover();
    this.showToast('Annotation saved');
    this.notifyStateChanged();

    return {
      annotation,
      ok: true,
      state: this.getState()
    };
  }

  private createStoredAnnotation(snapshot: SelectionSnapshot): StoredAnnotation {
    const target = this.requireArticleTarget();
    const now = new Date().toISOString();
    const span: TextSpan = {
      end: snapshot.end,
      start: snapshot.start,
      text: snapshot.quote
    };

    return {
      context: getContext(this.getSourceText(), span, this.settings.context),
      createdAt: now,
      id: crypto.randomUUID(),
      pageKey: target.metadata.pageKey,
      pageTitle: target.metadata.articleTitle,
      pageUrl: target.metadata.pageUrl,
      siteName: target.metadata.siteName,
      span,
      style: this.selectedStyle,
      updatedAt: now
    };
  }

  private async deleteAnnotation(id: string): Promise<DeleteAnnotationResponse> {
    if (!this.annotator) {
      return {
        ok: false,
        reason: EMPTY_STATE_REASON,
        state: this.getState()
      };
    }

    const existedInStore = this.annotations.some((annotation) => annotation.id === id);
    this.annotator.removeAnnotation(id);
    await deleteStoredAnnotation(id);
    this.annotations = this.annotations.filter((annotation) => annotation.id !== id);
    this.hidePopover();

    if (existedInStore) {
      this.showToast('Annotation deleted');
    }

    this.notifyStateChanged();

    return {
      ok: true,
      state: this.getState()
    };
  }

  private getArticleText(): ArticleTextResponse {
    if (!this.articleTarget) {
      return {
        ok: false,
        reason: EMPTY_STATE_REASON
      };
    }

    return {
      articleText: this.getSourceText().trim(),
      ok: true
    };
  }

  private async updateSettings(settings: UserSettings): Promise<UpdateSettingsResponse> {
    const previousContext = this.settings.context;
    this.settings = await writeUserSettings(settings);

    if (!isSameContextSettings(previousContext, this.settings.context)) {
      await this.refreshAnnotationContexts();
    }

    this.notifyStateChanged();

    return {
      ok: true,
      state: this.getState()
    };
  }

  private async refreshAnnotationContexts() {
    if (!this.articleTarget || this.annotations.length === 0) {
      return;
    }

    const sourceText = this.getSourceText();
    this.annotations = this.annotations.map((annotation) => ({
      ...annotation,
      context: getContext(sourceText, annotation.span, this.settings.context)
    }));

    for (const annotation of this.annotations) {
      await upsertStoredAnnotation(annotation);
    }
  }

  private getCurrentSelectionSnapshot(): SelectionSnapshot | null {
    const target = this.articleTarget;
    const selection = document.getSelection();

    if (!target || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const range = selection.getRangeAt(0).cloneRange();

    if (!this.isRangeInsideArticle(range)) {
      return null;
    }

    const quote = range.toString();

    if (!quote.trim()) {
      return null;
    }

    const { start, end } = getRangeOffsets(target.root, range);

    if (end <= start) {
      return null;
    }

    return {
      end,
      quote,
      range,
      start
    };
  }

  private isRangeInsideArticle(range: Range): boolean {
    const root = this.articleTarget?.root;

    if (!root) {
      return false;
    }

    return root.contains(range.startContainer) && root.contains(range.endContainer);
  }

  private showPopover(annotation: TextAnnotation, event: PointerEvent) {
    const popover = this.ensurePopover();
    const quote = annotation.target.selector[0]?.quote ?? 'Annotation';
    const rect = getAnnotationRect(annotation) ?? pointToRect(event.clientX, event.clientY);

    this.activePopoverId = annotation.id;
    this.activeSelection = null;

    if (this.popoverQuote) {
      this.popoverQuote.textContent = quote.trim();
    }

    this.configurePopoverAction('delete');
    popover.hidden = false;
    this.positionPopover(rect);
  }

  private showSelectionPopoverFromCurrentSelection(fallbackRect: DOMRect) {
    const snapshot = this.getCurrentSelectionSnapshot();

    if (!snapshot) {
      return;
    }

    this.lastSelection = snapshot;
    this.showSelectionPopover(snapshot, getRangeRect(snapshot.range) ?? fallbackRect);
  }

  private showSelectionPopover(snapshot: SelectionSnapshot, rect: DOMRect) {
    const popover = this.ensurePopover();

    this.activePopoverId = null;
    this.activeSelection = snapshot;

    if (this.popoverQuote) {
      this.popoverQuote.textContent = snapshot.quote.trim();
    }

    this.configurePopoverAction('annotate');
    this.updateStylePickerButtons();
    popover.hidden = false;
    this.positionPopover(rect);
  }

  private positionPopover(rect: DOMRect) {
    const popover = this.ensurePopover();

    popover.style.left = '0px';
    popover.style.top = '0px';

    const maxLeft = Math.max(12, window.innerWidth - popover.offsetWidth - 12);
    const maxTop = Math.max(12, window.innerHeight - popover.offsetHeight - 12);
    const left = clamp(rect.left + rect.width / 2 - popover.offsetWidth / 2, 12, maxLeft);
    const above = rect.top - popover.offsetHeight - 10;
    const below = rect.bottom + 10;
    const top = above >= 12 ? above : clamp(below, 12, maxTop);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  private ensurePopover(): HTMLElement {
    if (this.popover) {
      return this.popover;
    }

    const popover = document.createElement('div');
    popover.className = 'annotatee-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');

    const quote = document.createElement('p');
    quote.className = 'annotatee-popover__quote';

    const actionButton = document.createElement('button');
    actionButton.className = 'annotatee-popover__button';
    actionButton.type = 'button';
    actionButton.addEventListener('click', () => {
      void this.handlePopoverAction();
    });

    const stylePicker = document.createElement('div');
    stylePicker.className = 'annotatee-popover__styles';
    stylePicker.setAttribute('aria-label', 'Annotation style');

    this.popoverStyleButtons = ANNOTATION_STYLE_IDS.map((styleId) => {
      const preset = ANNOTATION_STYLE_PRESETS[styleId];
      const button = document.createElement('button');
      button.className = 'annotatee-popover__style-button';
      button.type = 'button';
      button.title = preset.label;
      button.setAttribute('aria-label', preset.label);
      button.dataset.styleId = styleId;
      button.style.setProperty('--annotatee-style-color', preset.swatch);
      button.addEventListener('click', () => {
        this.selectAnnotationStyle(styleId);
      });

      stylePicker.appendChild(button);
      return button;
    });

    popover.append(quote, actionButton, stylePicker);
    document.body.appendChild(popover);
    this.popover = popover;
    this.popoverActionButton = actionButton;
    this.popoverQuote = quote;
    this.popoverStylePicker = stylePicker;

    return popover;
  }

  private configurePopoverAction(action: 'annotate' | 'delete') {
    const button = this.popoverActionButton;

    if (!button) {
      return;
    }

    button.replaceChildren();

    if (action === 'annotate') {
      button.className = 'annotatee-popover__button annotatee-popover__button--annotate';
      button.title = 'Annotate selection';
      button.setAttribute('aria-label', 'Annotate selection');
      button.textContent = 'Annotate';
      this.showStylePicker();
      return;
    }

    button.className = 'annotatee-popover__button annotatee-popover__button--delete';
    button.title = 'Delete annotation';
    button.setAttribute('aria-label', 'Delete annotation');
    button.appendChild(createTrashIcon());
    this.hideStylePicker();
  }

  private selectAnnotationStyle(styleId: AnnotationStyleId) {
    this.selectedStyle = styleId;
    this.updateStylePickerButtons();
  }

  private showStylePicker() {
    if (this.popoverStylePicker) {
      this.popoverStylePicker.hidden = false;
    }
  }

  private hideStylePicker() {
    if (this.popoverStylePicker) {
      this.popoverStylePicker.hidden = true;
    }
  }

  private updateStylePickerButtons() {
    this.popoverStyleButtons.forEach((button) => {
      const isSelected = button.dataset.styleId === this.selectedStyle;
      button.classList.toggle('annotatee-popover__style-button--selected', isSelected);
      button.setAttribute('aria-pressed', String(isSelected));
    });
  }

  private async handlePopoverAction() {
    if (this.activeSelection) {
      await this.annotateSnapshot(this.activeSelection);
      return;
    }

    if (this.activePopoverId) {
      await this.deleteAnnotation(this.activePopoverId);
    }
  }

  private hidePopover() {
    if (this.popover) {
      this.popover.hidden = true;
    }

    this.activePopoverId = null;
    this.activeSelection = null;
  }

  private showToast(message: string) {
    if (!this.toast) {
      this.toast = document.createElement('div');
      this.toast.className = 'annotatee-toast';
      document.body.appendChild(this.toast);
    }

    window.clearTimeout(this.toastTimer);
    this.toast.textContent = message;
    this.toast.hidden = false;
    this.toastTimer = window.setTimeout(() => {
      if (this.toast) {
        this.toast.hidden = true;
      }
    }, 1800);
  }

  private failedAnnotation(reason: string): AnnotateSelectionResponse {
    this.showToast(reason);

    return {
      ok: false,
      reason,
      state: this.getState()
    };
  }

  private getState(): ExtensionState {
    if (!this.articleTarget) {
      return {
        annotations: [],
        enabled: false,
        reason: EMPTY_STATE_REASON,
        settings: this.settings
      };
    }

    return {
      annotations: this.annotations,
      article: this.articleTarget.metadata,
      enabled: true,
      settings: this.settings
    };
  }

  private getSourceText(): string {
    return this.articleTarget?.root.textContent ?? this.articleTarget?.sourceText ?? '';
  }

  private notifyStateChanged() {
    try {
      chrome.runtime.sendMessage(
        {
          state: this.getState(),
          type: 'STATE_CHANGED'
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } catch {
      // The popup is usually closed; state is still persisted.
    }
  }

  private requireArticleTarget(): ReadableArticleTarget {
    if (!this.articleTarget) {
      throw new Error(EMPTY_STATE_REASON);
    }

    return this.articleTarget;
  }
}

function toTextAnnotation(annotation: StoredAnnotation): TextAnnotation {
  const style = normalizeAnnotationStyle(annotation.style);

  return {
    bodies: [],
    id: annotation.id,
    properties: {
      [ANNOTATION_STYLE_PROPERTY]: style
    },
    target: {
      annotation: annotation.id,
      created: new Date(annotation.createdAt),
      selector: [
        {
          end: annotation.span.end,
          quote: annotation.span.text,
          start: annotation.span.start
        }
      ],
      updated: new Date(annotation.updatedAt)
    }
  };
}

function getAnnotationHighlightStyle(annotation: TextAnnotation): HighlightStyle {
  const style = normalizeAnnotationStyle(annotation.properties?.[ANNOTATION_STYLE_PROPERTY]);

  return ANNOTATION_STYLE_PRESETS[style].highlight;
}

function getRangeOffsets(root: HTMLElement, range: Range): Pick<SelectionSnapshot, 'end' | 'start'> {
  const beforeSelection = document.createRange();
  beforeSelection.selectNodeContents(root);
  beforeSelection.setEnd(range.startContainer, range.startOffset);

  const start = beforeSelection.toString().length;

  return {
    end: start + range.toString().length,
    start
  };
}

function getAnnotationRect(annotation: TextAnnotation): DOMRect | null {
  const rects = annotation.target.selector.flatMap((selector) => {
    if (!('range' in selector) || !(selector.range instanceof Range)) {
      return [];
    }

    return Array.from(selector.range.getClientRects());
  });

  return getBoundsRect(rects);
}

function getRangeRect(range: Range): DOMRect | null {
  return getBoundsRect(Array.from(range.getClientRects()));
}

function getBoundsRect(rects: DOMRect[]): DOMRect | null {
  const visibleRects = rects.filter((rect) => rect.width > 0 || rect.height > 0);

  if (visibleRects.length === 0) {
    return null;
  }

  const bounds = visibleRects.reduce(
    (accumulator, rect) => ({
      bottom: Math.max(accumulator.bottom, rect.bottom),
      left: Math.min(accumulator.left, rect.left),
      right: Math.max(accumulator.right, rect.right),
      top: Math.min(accumulator.top, rect.top)
    }),
    {
      bottom: visibleRects[0].bottom,
      left: visibleRects[0].left,
      right: visibleRects[0].right,
      top: visibleRects[0].top
    }
  );

  return new DOMRect(
    bounds.left,
    bounds.top,
    bounds.right - bounds.left,
    bounds.bottom - bounds.top
  );
}

function pointToRect(x: number, y: number): DOMRect {
  return new DOMRect(x, y, 1, 1);
}

function createTrashIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');

  for (const pathData of [
    'M3 6h18',
    'M8 6V4h8v2',
    'M19 6l-1 14H6L5 6',
    'M10 11v5',
    'M14 11v5'
  ]) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathData);
    icon.appendChild(path);
  }

  return icon;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function isSameContextSettings(first: ContextSettings, second: ContextSettings): boolean {
  return first.mode === second.mode && first.range === second.range;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function startWhenReady() {
  const controller = new ArticleAnnotationController();
  void controller.start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startWhenReady, { once: true });
} else {
  startWhenReady();
}
