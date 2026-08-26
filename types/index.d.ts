// dsh-cognitio-core 类型声明（运行入口 lib/index.mjs 的 default export）
export interface CognitioCtx {
  on(event: string, listener: (...args: any[]) => any): void;
  get?(name: string): unknown;
  [key: string]: unknown;
}

export interface CognitioCorePlugin {
  apply(ctx: CognitioCtx): (() => void) | void;
}

declare const plugin: CognitioCorePlugin;
export default plugin;
