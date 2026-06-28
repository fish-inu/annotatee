interface ChromeEvent<T extends (...args: any[]) => unknown> {
  addListener(listener: T): void;
  removeListener(listener: T): void;
}

interface ChromeMessageSender {
  tab?: {
    id?: number;
    title?: string;
    url?: string;
  };
}

interface ChromeTab {
  id?: number;
  title?: string;
  url?: string;
}

interface ChromeRuntimeError {
  message?: string;
}

declare const chrome: {
  contextMenus: {
    create(properties: {
      id: string;
      title: string;
      contexts: string[];
      documentUrlPatterns?: string[];
    }): void;
    removeAll(callback?: () => void): void;
    onClicked: ChromeEvent<
      (
        info: {
          menuItemId: string | number;
          selectionText?: string;
        },
        tab?: ChromeTab
      ) => void
    >;
  };
  runtime: {
    lastError?: ChromeRuntimeError;
    onInstalled: ChromeEvent<() => void>;
    onMessage: ChromeEvent<
      (
        message: unknown,
        sender: ChromeMessageSender,
        sendResponse: (response?: unknown) => void
      ) => boolean | void
    >;
    sendMessage(message: unknown, callback?: (response?: unknown) => void): void;
  };
  storage: {
    local: {
      get(
        keys: string | string[] | Record<string, unknown> | null,
        callback: (items: Record<string, unknown>) => void
      ): void;
      set(items: Record<string, unknown>, callback?: () => void): void;
    };
  };
  tabs: {
    query(
      queryInfo: {
        active?: boolean;
        currentWindow?: boolean;
      },
      callback: (tabs: ChromeTab[]) => void
    ): void;
    sendMessage(tabId: number, message: unknown, callback?: (response?: unknown) => void): void;
  };
};
