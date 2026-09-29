import type { ContentRequest, StateChangedMessage } from './types';

export function isContentRequest(message: unknown): message is ContentRequest {
  if (!isRecord(message) || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === 'DELETE_ANNOTATION') {
    return typeof message.id === 'string';
  }

  if (message.type === 'UPDATE_ANNOTATION_NOTE') {
    return typeof message.id === 'string' && typeof message.note === 'string';
  }

  return (
    message.type === 'ANNOTATE_SELECTION' ||
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
