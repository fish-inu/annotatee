import type { ContentRequest, StateChangedMessage } from './types';

export function isContentRequest(message: unknown): message is ContentRequest {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  return (
    message.type === 'ANNOTATE_SELECTION' ||
    message.type === 'DELETE_ANNOTATION' ||
    message.type === 'GET_ARTICLE_TEXT' ||
    message.type === 'GET_STATE' ||
    message.type === 'UPDATE_SETTINGS'
  );
}

export function isStateChangedMessage(message: unknown): message is StateChangedMessage {
  return isRecord(message) && message.type === 'STATE_CHANGED' && isRecord(message.state);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
