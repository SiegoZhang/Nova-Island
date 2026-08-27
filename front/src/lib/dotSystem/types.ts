// 点阵设计系统的公共类型——所有效果（球体/疏密/纹理/视频亮度点阵/生成式
// 参考图点阵）共用这一份类型定义，取代过去四处各自声明的同类型。

/** 连续渐变的色标：FlowNoiseDots 系列（球体流动噪声）用这个形状。 */
export interface ColorStop {
  stop: number;
  rgb: [number, number, number];
}

/** 离散分档：EarthStipple 系列（疏密点阵）按密度分档，每档独立控制大小/颜色/透明度。 */
export interface StippleTier {
  id: string;
  label: string;
  minDensity: number;
  maxDensity: number;
  radius: number;
  color: string;
  alpha: number;
}

/** 三段式配色：particle-field 系列（生成式参考图点阵）用 deep/mid/light 三段插值。 */
export interface FieldColors {
  background: string;
  light: [number, number, number];
  mid: [number, number, number];
  deep: [number, number, number];
  accent: [number, number, number];
}

export interface SphereGeometry {
  cx: number;
  cy: number;
  r: number;
}

/** particle-field 六个 mode 共用的采样/尺寸/透明度参数——每个 mode 只应
 * 覆盖 referenceSrc/expectedMaxDeviation，其余数值从这里继承。 */
export interface ImageSampledTuning {
  step: number;
  minRadius: number;
  maxRadius: number;
  maxAlpha: number;
  alphaGamma: number;
}

/** 鼠标拖尾效果（HeroDotTexture 的发光轨迹 / HeroCosmosReveal 的擦洞轨迹）
 * 共用的生命周期参数。 */
export interface PointerTrailTuning {
  lifetimeMs: number;
  radius: number;
  minMove: number;
  maxPoints: number;
}
