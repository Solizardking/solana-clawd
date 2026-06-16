import { useEffect } from "react";
import { create } from "zustand";

import { LAYOUT_COMPACT_MEDIA_QUERY } from "@/constants";
import type { RightPanel } from "@/types/layout";

interface ChatLayoutState {
  isSidebarOpen: boolean;
  activeRightPanel: RightPanel;
  isCompactLayout: boolean;

  setIsSidebarOpen: (open: boolean) => void;
  setActiveRightPanel: (panel: RightPanel) => void;
  setIsCompactLayout: (compact: boolean) => void;
  toggleSidebar: () => void;
  toggleRightPanel: (panel: Exclude<RightPanel, null>) => void;
}

const useChatLayoutStore = create<ChatLayoutState>((set, get) => ({
  isSidebarOpen: false,
  activeRightPanel: null,
  isCompactLayout: false,

  setIsSidebarOpen: (open) => set({ isSidebarOpen: open }),
  setActiveRightPanel: (panel) => set({ activeRightPanel: panel }),
  setIsCompactLayout: (compact) => set({ isCompactLayout: compact }),

  toggleSidebar: () => {
    const state = get();
    const next = !state.isSidebarOpen;

    if (next && state.isCompactLayout && state.activeRightPanel !== null) {
      set({ isSidebarOpen: next, activeRightPanel: null });
    } else {
      set({ isSidebarOpen: next });
    }
  },

  toggleRightPanel: (panel) => {
    const state = get();

    if (state.activeRightPanel === panel) {
      set({ activeRightPanel: null });
      return;
    }

    if (state.isCompactLayout) {
      set({ activeRightPanel: panel, isSidebarOpen: false });
    } else {
      set({ activeRightPanel: panel });
    }
  },
}));

export function useChatLayout() {
  const isSidebarOpen = useChatLayoutStore((state) => state.isSidebarOpen);
  const activeRightPanel = useChatLayoutStore(
    (state) => state.activeRightPanel,
  );
  const isCompactLayout = useChatLayoutStore((state) => state.isCompactLayout);
  const setIsSidebarOpen = useChatLayoutStore(
    (state) => state.setIsSidebarOpen,
  );
  const setIsCompactLayout = useChatLayoutStore(
    (state) => state.setIsCompactLayout,
  );
  const toggleSidebar = useChatLayoutStore((state) => state.toggleSidebar);
  const toggleRightPanel = useChatLayoutStore(
    (state) => state.toggleRightPanel,
  );

  // Computed values
  const isRightPanelVisible = activeRightPanel !== null;
  const shouldShowOverlay =
    isCompactLayout && (isSidebarOpen || isRightPanelVisible);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(LAYOUT_COMPACT_MEDIA_QUERY);
    const updateLayout = (matches: boolean) => setIsCompactLayout(matches);

    updateLayout(mediaQuery.matches);

    const listener = (event: MediaQueryListEvent) =>
      updateLayout(event.matches);

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", listener);
    } else {
      mediaQuery.addListener(listener);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === "function") {
        mediaQuery.removeEventListener("change", listener);
      } else {
        mediaQuery.removeListener(listener);
      }
    };
  }, [setIsCompactLayout]);

  const closeRightPanel = () =>
    useChatLayoutStore.getState().setActiveRightPanel(null);

  return {
    isCompactLayout,
    isSidebarOpen,
    activeRightPanel,
    isRightPanelVisible,
    shouldShowOverlay,
    setIsSidebarOpen,
    toggleSidebar,
    toggleRightPanel,
    closeRightPanel,
  };
}
