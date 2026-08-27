import type { ParticleFieldMode } from "@/components/particle-field";

// 六个维度都用生成式点阵视觉（ParticleField 的 flow / gravity / assembly /
// convergence / resonance / breakaway mode）而不是静态图——每个维度的概念
// 本身就是"信息流动/趋势涌现""聚焦核心/深度吸收""知识沉淀/系统构建"
// "多元汇聚/碰撞新知""多个节点发出信号、寻找同频、产生共振""突破边界、
// 引领新局"，用同一套点阵语言直接生成比配一张照片更贴切。visual 仍保留
// image 分支，后续如果某个维度想换回实拍图，直接改它的 visual 即可，不
// 需要动交互逻辑。首页轮播（AiCommunityCarousel）与 /ai 页手风琴
// （AiCommunitySection）共用这份数据。
export interface AiCommunityFeature {
  label: string;
  description: string;
  visual:
    | { type: "image"; src: string }
    | { type: "particle"; mode: ParticleFieldMode }
    | { type: "flag" }
    | { type: "ring-sphere-dot-matrix" }
    | { type: "tool-dot-matrix" }
    | { type: "sphere-connect-dot-matrix" }
    | { type: "navigator-dot-matrix" }
    | { type: "salon-dot-matrix" };
}

export const aiCommunityFeatures: AiCommunityFeature[] = [
  {
    label: "每周风向",
    description:
      "每周精选 AI 行业最值得关注的动态与趋势，从模型发布、产品迭代到资本与政策变化，替你过滤掉重复的噪音与炒作，只留下真正影响判断的信息。花十分钟读完，就能跟上这一周的行业变化。",
    // 静态旗帜素材（见 assets/旗帜.png），按 Figma（node 177:5474）还原：
    // 不做点阵化，就是同一张图叠两层普通图片——下层模糊、上层清晰，两层
    // 各自旋转 15° 并略微错位，见 FlagVisual。
    visual: { type: "flag" },
  },
  {
    label: "超级内容",
    description:
      "深度长文、真实案例拆解与可复用的方法论沉淀，覆盖从技术原理到落地路径的完整链条。不追热点标题，只把一件事背后的逻辑讲透，让你对 AI 的理解真正比别人深一层。",
    // 环形球体视频素材（assets/环形球体.mp4）点阵化，见 RingSphereDotMatrix——
    // 视频背景是纯色蓝，用色键抠像而不是纯亮度阈值分离球体和背景。
    visual: { type: "ring-sphere-dot-matrix" },
  },
  {
    label: "工具教程",
    description:
      "精选值得投入时间的 AI 工具，提供从注册配置、核心用法到进阶技巧的完整教程，并附上真实的使用场景与避坑提示。不做功能罗列，帮你把工具真正嵌进日常工作流。",
    // 工具视频素材（assets/工具视频.mp4，齿轮/轴承分解组装）点阵化，见
    // ToolDotMatrix——跟旗帜视频一样是纯黑背景，用亮度阈值抠像，不需要色键。
    visual: { type: "tool-dot-matrix" },
  },
  {
    label: "精选沙龙",
    description:
      "定期举办线上与线下沙龙，每场只聚焦一个具体议题，邀请一线实践者分享真实经验，并留足自由讨论的时间。人数有限、话题收敛，让每一次交流都能带走可执行的收获，而不是泛泛而谈。",
    // 钻石视频素材（assets/精选.mp4）点阵化，见 SalonDotMatrix——跟环形球体
    // 视频一样是纯色蓝背景，用色键抠像。
    visual: { type: "salon-dot-matrix" },
  },
  {
    label: "同频集会",
    description:
      "连接真实在做 AI 落地的人——创业者、产品、工程师与研究者，按行业和方向自然形成小圈子。在这里你可以抛出具体问题、交换一手资源与踩坑经验，也可能遇到下一个合作伙伴。",
    // 小球连接视频素材（assets/小球连接.mp4）点阵化，见 SphereConnectDotMatrix——
    // 跟旗帜/工具视频一样靠亮度阈值抠像，只是背景不是纯黑而是深蓝紫渐变，
    // 阈值/柔化调得更保守一些。
    visual: { type: "sphere-connect-dot-matrix" },
  },
  {
    label: "成为领航员",
    description:
      "持续输出内容、组织活动或帮助他人的活跃成员，可申请成为社群领航员，获得专属资源、优先曝光机会与更深度的圈层连接。我们希望社群的价值，由真正投入的人共同定义。",
    // 领航员视频素材（assets/领航员视频.mp4）点阵化，见 NavigatorDotMatrix——
    // 跟旗帜/工具视频一样是纯黑背景，用亮度阈值抠像。
    visual: { type: "navigator-dot-matrix" },
  },
];
