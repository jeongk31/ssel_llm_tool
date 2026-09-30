// jsvectormap ships no TypeScript types. Only the small surface the usage map
// uses is declared here, rather than falling back to an untyped `any`.
declare module "jsvectormap" {
  interface JsVectorMapOptions {
    selector: string | HTMLElement;
    map: string;
    zoomButtons?: boolean;
    regionStyle?: Record<string, unknown>;
    series?: Record<string, unknown>;
    onRegionTooltipShow?: (
      event: unknown,
      tooltip: { text: (value?: string) => string },
      code: string,
    ) => void;
  }

  export default class JsVectorMap {
    constructor(options: JsVectorMapOptions);
    destroy(): void;
    updateSize(): void;
  }
}

declare module "jsvectormap/dist/maps/world.js";
