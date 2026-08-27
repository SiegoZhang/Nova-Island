// 生成式点阵视觉系统的公共类型。所有 mode（resonance / flow / gravity / ...）
// 都实现同一个 FieldMode 接口，ParticleField 组件只认这个接口，不关心具体
// mode 内部怎么组织粒子——新增 mode 时只需要新写一个 xxxMode.ts 并注册到
// ParticleField 的 MODES 表里。

export interface FieldColors {
  /** 画布底色，始终应为纯白或接近纯白。 */
  background: string;
  light: [number, number, number];
  mid: [number, number, number];
  deep: [number, number, number];
  /** 荧光绿强调色，只用于少量粒子。 */
  accent: [number, number, number];
}

export interface FieldConfig {
  colors: FieldColors;
  /** 核心节点数量，不同 mode 自行决定怎么用（resonance 用作共振节点数）。 */
  nodeCount: number;
  interactive: boolean;
  /** 鼠标影响半径（css px）。 */
  pointerRadius: number;
}

export interface PointerInput {
  x: number;
  y: number;
  active: boolean;
}

export interface FieldMode<TState> {
  createState(width: number, height: number, config: FieldConfig): TState;
  /** 只做数据模拟，不接触 canvas——所有随时间变化的可视化参数都在这里算好存进 state。 */
  update(
    state: TState,
    dtMs: number,
    elapsedMs: number,
    pointer: PointerInput,
    config: FieldConfig,
  ): void;
  /** 纯渲染，只读 state，不做模拟计算。 */
  draw(
    ctx: CanvasRenderingContext2D,
    state: TState,
    width: number,
    height: number,
    config: FieldConfig,
  ): void;
}
