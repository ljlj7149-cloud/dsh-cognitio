// cognitio-core 聚合入口（阶段二：包内自含，唯一实现）。
//
// 四类事件监听在单个 apply(ctx) 里聚合注册（对应工作区旧的四行挂载）：
//   pre-step 哨兵注入 / agent-error 出错归入 / turn-stopping 回合归档 / tools-pre-execute 动作前观测
// 数据目录：MEMORY_DIR 环境变量优先（默认 D:/deepseek/.memory 兼容生产库）。
//
// 防御设计延续：任一插件 apply 失败静默跳过，绝不破坏回合；
// 清理函数聚合：插件停止时统一回收事件监听与 InMemoryTransport 连接。
import sentinel from './sentinel.mjs';
import errorCapture from './error-capture.mjs';
import turnArchive from './turn-archive.mjs';
import actionGuard from './action-guard.mjs';
import { installPanelApi } from './panel-api.mjs';

export default {
  // 硬依赖注入（对照 dsh-message-edit 官方先例）：webServer 用于注册面板 HTTP 端点，
  // 不声明 inject 则 service 不可达（实测 /cognitio-panel 404=端点未注册的根因）。
  inject: ['webServer'],
  apply(ctx) {
    const disposers = [];
    try { installPanelApi(ctx); } catch { /* 面板端点失败不影响主插件 */ }
    for (const plugin of [sentinel, errorCapture, turnArchive, actionGuard]) {
      try {
        const d = plugin.apply?.(ctx);
        if (typeof d === 'function') disposers.push(d);
      } catch { /* 防御：单插件失败不影响其余 */ }
    }
    return () => {
      for (const d of disposers) {
        try { d(); } catch { /* 防御 */ }
      }
    };
  },
};
