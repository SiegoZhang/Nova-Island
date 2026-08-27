import { promises as fs } from "fs";
import { NextResponse } from "next/server";
import path from "path";

// 仅供本地开发时"AI 社群点阵调参面板"使用：面板上任意滑块/取色器松手后，
// dotSystemTuningControls.tsx 里的 persistDotTuningValue 会 POST 到这里，
// 直接把新数值写回对应组件文件里的 *_DEFAULTS 常量（以及 tokens.ts 里的
// 存档快照），下次热更新/刷新页面就是这次调好的数值，不需要再手动把面板
// 上的数字抄回源码。只允许写下面这份白名单里列出的文件/常量，且只在开发
// 环境生效——生产构建里这个路由直接 404，任何写文件的可能性都上不了线。

const COMPONENT_DEFAULTS: Record<
  string,
  { file: string; constName: string; snapshotConstName: string }
> = {
  flag: {
    file: "src/components/FlagVisual.tsx",
    constName: "FLAG_DEFAULTS",
    snapshotConstName: "AI_COMMUNITY_FLAG_DEFAULTS_SNAPSHOT",
  },
  ringSphere: {
    file: "src/components/RingSphereDotMatrix.tsx",
    constName: "RING_SPHERE_DEFAULTS",
    snapshotConstName: "AI_COMMUNITY_RING_SPHERE_DEFAULTS_SNAPSHOT",
  },
  tool: {
    file: "src/components/ToolDotMatrix.tsx",
    constName: "TOOL_DEFAULTS",
    snapshotConstName: "AI_COMMUNITY_TOOL_DEFAULTS_SNAPSHOT",
  },
  salon: {
    file: "src/components/SalonDotMatrix.tsx",
    constName: "SALON_DEFAULTS",
    snapshotConstName: "AI_COMMUNITY_SALON_DEFAULTS_SNAPSHOT",
  },
  sphereConnect: {
    file: "src/components/SphereConnectDotMatrix.tsx",
    constName: "SPHERE_CONNECT_DEFAULTS",
    snapshotConstName: "AI_COMMUNITY_SPHERE_CONNECT_DEFAULTS_SNAPSHOT",
  },
  navigator: {
    file: "src/components/NavigatorDotMatrix.tsx",
    constName: "NAVIGATOR_DEFAULTS",
    snapshotConstName: "AI_COMMUNITY_NAVIGATOR_DEFAULTS_SNAPSHOT",
  },
  // FDE 第一章卡片右侧的点阵地球，没有单独的存档快照常量，
  // snapshotConstName 复用同一个名字（tokens.ts 里找不到这个块时
  // replaceInBlock 会原样跳过，不报错也不会误改别的常量）。
  fdeGlobe: {
    file: "src/components/FdeGlobeLogos.tsx",
    constName: "GLOBE_DEFAULTS",
    snapshotConstName: "GLOBE_DEFAULTS",
  },
  // ContactCtaSection 没有单独的存档快照常量（不在首页 AI 社群六张卡片
  // 之列）——snapshotConstName 复用同一个名字，tokens.ts 里找不到这个块
  // 时 replaceInBlock 会原样跳过，不会报错，也不会误改别的常量。
  contact: {
    file: "src/components/ContactCtaSection.tsx",
    constName: "CONTACT_DEFAULTS",
    snapshotConstName: "CONTACT_DEFAULTS",
  },
  // 团队区块「工程师文化」卡片的点阵纹理，同样没有单独的存档快照常量，
  // snapshotConstName 复用同一个名字（tokens.ts 里找不到这个块时
  // replaceInBlock 会原样跳过，不报错也不会误改别的常量）。
  teamEngineer: {
    file: "src/components/TeamSection.tsx",
    constName: "TEAM_ENGINEER_DOT_DEFAULTS",
    snapshotConstName: "TEAM_ENGINEER_DOT_DEFAULTS",
  },
  teamCompass: {
    file: "src/components/TeamSection.tsx",
    constName: "TEAM_COMPASS_DOT_DEFAULTS",
    snapshotConstName: "TEAM_COMPASS_DOT_DEFAULTS",
  },
  teamClock: {
    file: "src/components/TeamSection.tsx",
    constName: "TEAM_CLOCK_DOT_DEFAULTS",
    snapshotConstName: "TEAM_CLOCK_DOT_DEFAULTS",
  },
  teamBook: {
    file: "src/components/TeamSection.tsx",
    constName: "TEAM_BOOK_DOT_DEFAULTS",
    snapshotConstName: "TEAM_BOOK_DOT_DEFAULTS",
  },
};

const SNAPSHOT_FILE = "src/lib/dotSystem/tokens.ts";

/** 只接受合法的常量字段名，防止 key 被拼进正则时带进特殊字符。 */
const KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

function serializeValue(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && /^#[0-9a-fA-F]{3,8}$/.test(value)) return `"${value}"`;
  return null;
}

/**
 * 在 `const ${constName} = { ... } as const;` 这个块内，把 `key: <旧值>,`
 * 替换成 `key: <新值>,`——只在这个块的范围内替换，不会误改文件其他地方
 * 同名字段（比如 JSX 里 `background = XXX_DEFAULTS.background` 这种引用
 * 写法，等号两侧都对不上 `key:` 的模式，不会被匹配到）。
 */
function replaceInBlock(
  source: string,
  constName: string,
  key: string,
  serialized: string,
): { next: string; changed: boolean } {
  const blockRe = new RegExp(`(const\\s+${constName}\\s*=\\s*\\{)([\\s\\S]*?)(\\}\\s*as const;)`);
  const match = blockRe.exec(source);
  if (!match || match.index === undefined) return { next: source, changed: false };

  const [whole, head, body, tail] = match;
  const fieldRe = new RegExp(`(\\b${key}\\s*:\\s*)(?:"[^"]*"|-?\\d+(?:\\.\\d+)?)(\\s*,)`);
  if (!fieldRe.test(body)) return { next: source, changed: false };

  const nextBody = body.replace(fieldRe, `$1${serialized}$2`);
  const nextBlock = `${head}${nextBody}${tail}`;
  return {
    next: source.slice(0, match.index) + nextBlock + source.slice(match.index + whole.length),
    changed: true,
  };
}

export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "disabled in production" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const componentId = typeof body?.componentId === "string" ? body.componentId : undefined;
  const key = typeof body?.key === "string" ? body.key : undefined;
  const value = body?.value;

  const target = componentId ? COMPONENT_DEFAULTS[componentId] : undefined;
  if (!target || !key || !KEY_PATTERN.test(key)) {
    return NextResponse.json({ error: "invalid componentId/key" }, { status: 400 });
  }

  const serialized = serializeValue(value);
  if (serialized === null) {
    return NextResponse.json({ error: "invalid value" }, { status: 400 });
  }

  const root = process.cwd();
  const componentPath = path.join(root, target.file);
  const componentSource = await fs.readFile(componentPath, "utf8");
  const componentResult = replaceInBlock(componentSource, target.constName, key, serialized);
  if (!componentResult.changed) {
    return NextResponse.json({ error: "field not found in component defaults" }, { status: 404 });
  }
  await fs.writeFile(componentPath, componentResult.next, "utf8");

  // 存档快照尽力同步；有些字段快照里还没收录（比如某几张卡片后补的
  // sizePercent）就跳过，不影响组件文件本身已经写入成功。
  const snapshotPath = path.join(root, SNAPSHOT_FILE);
  const snapshotSource = await fs.readFile(snapshotPath, "utf8");
  const snapshotResult = replaceInBlock(snapshotSource, target.snapshotConstName, key, serialized);
  if (snapshotResult.changed) {
    await fs.writeFile(snapshotPath, snapshotResult.next, "utf8");
  }

  return NextResponse.json({ ok: true, snapshotSynced: snapshotResult.changed });
}
