import { Readability, isProbablyReaderable } from '@mozilla/readability';
import { getCanonicalPageUrl, getPageKey } from './url';
import type { ArticleMetadata } from './types';

interface CandidateScore {
  element: HTMLElement;
  lengthRatio: number;
  score: number;
  tokenCoverage: number;
}

export interface ReadableArticleTarget {
  metadata: ArticleMetadata;
  root: HTMLElement;
  sourceText: string;
}

const MIN_ARTICLE_LENGTH = 420;
const MIN_ROOT_SCORE = 0.46;
const CANDIDATE_SELECTOR = [
  'article',
  'main',
  '[role="main"]',
  '[itemprop*="articleBody"]',
  '[class*="article" i]',
  '[class*="entry-content" i]',
  '[class*="post-content" i]',
  '[class*="story" i]',
  '[class*="body" i]',
  '[id*="article" i]',
  '[id*="content" i]',
  'section',
  'div'
].join(',');

export function detectReadableArticle(): ReadableArticleTarget | null {
  if (!document.body) {
    return null;
  }

  const clone = document.cloneNode(true) as Document;
  const readerable = safelyCheckReaderable(clone);
  const parsed = new Readability(clone).parse();
  const parsedText = normalizeText(parsed?.textContent ?? '');

  if (!parsed || parsedText.length < MIN_ARTICLE_LENGTH) {
    return null;
  }

  const root = findBestArticleRoot(parsedText);

  if (!root) {
    return null;
  }

  const pageUrl = getCanonicalPageUrl();
  const sourceText = root.textContent ?? '';

  return {
    root,
    sourceText,
    metadata: {
      areaLabel: getAreaLabel(root),
      articleTitle: parsed.title || document.title || 'Untitled article',
      excerpt: parsed.excerpt || undefined,
      pageKey: getPageKey(pageUrl),
      pageTitle: document.title || parsed.title || 'Untitled page',
      pageUrl,
      readerable,
      siteName: parsed.siteName || undefined
    }
  };
}

function findBestArticleRoot(parsedText: string): HTMLElement | null {
  const tokens = getMeaningfulTokens(parsedText);
  const articleLength = parsedText.length;
  const candidates = collectCandidates(articleLength);
  const scored = candidates
    .map((element) => scoreCandidate(element, parsedText, tokens, articleLength))
    .filter((score): score is CandidateScore => score !== null)
    .sort(compareCandidates);

  const best = scored[0];

  if (!best || best.score < MIN_ROOT_SCORE || best.element === document.body) {
    return null;
  }

  return best.element;
}

function collectCandidates(articleLength: number): HTMLElement[] {
  const candidates = new Set<HTMLElement>();

  document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR).forEach((element) => {
    if (isUsableCandidate(element, articleLength)) {
      candidates.add(element);
    }
  });

  return Array.from(candidates);
}

function isUsableCandidate(element: HTMLElement, articleLength: number): boolean {
  if (isInNonArticleChrome(element) || !isVisible(element)) {
    return false;
  }

  const textLength = normalizeText(getElementText(element)).length;
  const lowerBound = Math.max(180, articleLength * 0.25);
  const upperBound = Math.max(articleLength * 3.4, articleLength + 7000);

  if (textLength < lowerBound || textLength > upperBound) {
    return false;
  }

  return getLinkTextRatio(element, textLength) < 0.48;
}

function scoreCandidate(
  element: HTMLElement,
  parsedText: string,
  tokens: string[],
  articleLength: number
): CandidateScore | null {
  const candidateText = normalizeText(getElementText(element));

  if (!candidateText) {
    return null;
  }

  const tokenCoverage =
    tokens.length === 0
      ? 0
      : tokens.filter((token) => candidateText.includes(token)).length / tokens.length;
  const lengthRatio = Math.min(candidateText.length, articleLength) / Math.max(candidateText.length, articleLength);
  const semanticBoost = getSemanticBoost(element);
  const linkPenalty = getLinkTextRatio(element, candidateText.length) * 0.25;
  const score = tokenCoverage * 0.72 + lengthRatio * 0.2 + semanticBoost - linkPenalty;

  return {
    element,
    lengthRatio,
    score,
    tokenCoverage
  };
}

function compareCandidates(first: CandidateScore, second: CandidateScore): number {
  const scoreDelta = second.score - first.score;

  if (Math.abs(scoreDelta) > 0.025) {
    return scoreDelta;
  }

  const semanticDelta = getSemanticBoost(second.element) - getSemanticBoost(first.element);

  if (Math.abs(semanticDelta) > 0.01) {
    return semanticDelta;
  }

  return second.lengthRatio - first.lengthRatio;
}

function getMeaningfulTokens(text: string): string[] {
  const common = new Set([
    'about',
    'after',
    'again',
    'before',
    'between',
    'could',
    'their',
    'there',
    'these',
    'those',
    'through',
    'where',
    'which',
    'would'
  ]);
  const tokens = new Set<string>();

  for (const token of text.toLowerCase().match(/[a-z0-9][a-z0-9'-]{5,}/g) ?? []) {
    if (!common.has(token)) {
      tokens.add(token);
    }

    if (tokens.size >= 96) {
      break;
    }
  }

  return Array.from(tokens);
}

function getSemanticBoost(element: HTMLElement): number {
  const signature = `${element.tagName.toLowerCase()} ${element.id} ${element.className}`.toLowerCase();

  if (element.matches('article, [itemprop*="articleBody" i]')) {
    return 0.16;
  }

  if (element.matches('main, [role="main"]')) {
    return 0.1;
  }

  if (/\b(article|story|post|entry|body|content)\b/.test(signature)) {
    return 0.07;
  }

  return 0;
}

function getLinkTextRatio(element: HTMLElement, textLength: number): number {
  if (textLength === 0) {
    return 1;
  }

  const linkTextLength = Array.from(element.querySelectorAll('a')).reduce(
    (total, link) => total + normalizeText(link.textContent ?? '').length,
    0
  );

  return linkTextLength / textLength;
}

function isVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }

  return element.getClientRects().length > 0;
}

function isInNonArticleChrome(element: HTMLElement): boolean {
  return Boolean(
    element.closest(
      'aside, footer, form, header, nav, [aria-hidden="true"], [role="banner"], [role="contentinfo"], [role="navigation"], [role="search"]'
    )
  );
}

function getAreaLabel(element: HTMLElement): string {
  if (element.id) {
    return `${element.tagName.toLowerCase()}#${element.id}`;
  }

  const className =
    typeof element.className === 'string'
      ? element.className
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .join('.')
      : '';

  return className ? `${element.tagName.toLowerCase()}.${className}` : element.tagName.toLowerCase();
}

function getElementText(element: HTMLElement): string {
  return element.innerText || element.textContent || '';
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function safelyCheckReaderable(doc: Document): boolean {
  try {
    return isProbablyReaderable(doc);
  } catch {
    return false;
  }
}
