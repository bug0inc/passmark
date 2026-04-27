import type { Page } from "@playwright/test";
export type TabTarget = "main" | "latest" | number;
export type TabManager = {
    active: () => Page;
    pages: () => Page[];
    switchTo: (target: TabTarget) => Promise<Page>;
};
export declare const createTabManager: (initialPage: Page) => TabManager;
