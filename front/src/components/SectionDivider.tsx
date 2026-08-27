import { eRailContainer } from "@/lib/eleven";

interface GridJointProps {
  topBg: string;
  bottomBg: string;
}

function GridJoint({ topBg, bottomBg }: GridJointProps) {
  return (
    <span
      aria-hidden="true"
      className="relative z-10 flex size-4 shrink-0 -translate-x-1/2 items-center justify-center last:translate-x-1/2"
      style={{ background: `linear-gradient(to bottom, ${topBg} 50%, ${bottomBg} 50%)` }}
    >
      {/* 外层方块用上下两色分别贴合分割线上、下方板块的背景色，避免留白色块
          和实际背景不一致露馅。 */}
      <span className="block size-[4.8px] rounded-full bg-[#1c1917]" />
    </span>
  );
}

interface SectionDividerProps {
  /** 是否在与 GridRails 竖线的交点处显示圆点，默认显示。 */
  showJoints?: boolean;
  /** 交点方块上半部分的填色，必须和分割线上方板块的背景色一致，默认 #F8F9FA。 */
  topBg?: string;
  /** 交点方块下半部分的填色，必须和分割线下方板块的背景色一致，默认 #F8F9FA。 */
  bottomBg?: string;
}

/**
 * ElevenLabs 风格的网格分隔线：一条通栏发丝线，与 GridRails 的竖线在
 * 内容列边界相交，交点用一个留白方块隔断、中心嵌一个小圆点，用来在板块之间建立清晰的节奏感。
 * 留白方块的颜色必须跟上下相邻板块的实际背景色分别对应——本站板块背景统一为
 * #F8F9FA，调用方需要按实际相邻背景传入 topBg/bottomBg。
 */
export function SectionDivider({
  showJoints = true,
  topBg = "#F8F9FA",
  bottomBg = "#F8F9FA",
}: SectionDividerProps) {
  return (
    <div aria-hidden="true" className="relative h-px w-full bg-[#efefef]">
      {showJoints && (
        <div
          className={`relative flex h-full items-center justify-between ${eRailContainer}`}
        >
          <GridJoint topBg={topBg} bottomBg={bottomBg} />
          <GridJoint topBg={topBg} bottomBg={bottomBg} />
        </div>
      )}
    </div>
  );
}
