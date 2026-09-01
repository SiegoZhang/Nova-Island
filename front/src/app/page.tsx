import { HomeVariantHost } from "@/components/home-variants/HomeVariantHost";

// 首页现在是「多方案」的：给老板出方案时会有几套完全不同的设计，用右下角
// 切换器切换，彼此独立、互不影响。每套方案是 components/home-variants/ 下
// 一个独立文件，登记在 registry.ts 里；加删方案不用动这里。
//
// ?home=<id> 决定初始方案（把链接直接发给评审即可），没带参数时由
// HomeVariantHost 回退到 localStorage 上次选择 / 注册表默认方案。
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ home?: string }>;
}) {
  const { home } = await searchParams;
  return <HomeVariantHost initialVariantId={home ?? null} />;
}
