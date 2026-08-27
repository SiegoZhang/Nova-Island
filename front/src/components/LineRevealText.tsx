"use client";

import { Children, isValidElement, useLayoutEffect, useRef, type ReactNode } from "react";

interface Atom {
  key: string;
  node: ReactNode;
  /** 非文本子节点（比如段落里嵌的 AI社群/FDE 徽标按钮）需要按自身盒子
   *  的中线对齐，而不是文字默认的基线对齐。 */
  isElement: boolean;
}

// 把子节点拆成"排版原子"：普通文本按单字符拆分（中文按字换行，不是按
// 英文单词），非文本子节点整体当一个原子，不拆内部结构。拆完之后原子还
// 是按原顺序内联排列——拆分只是为了量出真实的换行位置，不改变排版本身。
function splitToAtoms(children: ReactNode): Atom[] {
  const atoms: Atom[] = [];
  let index = 0;

  Children.forEach(children, (child) => {
    if (typeof child === "string") {
      for (const ch of Array.from(child)) {
        atoms.push({ key: `c${index++}`, node: ch, isElement: false });
      }
      return;
    }
    if (isValidElement(child)) {
      atoms.push({ key: `e${index++}`, node: child, isElement: true });
    }
  });

  return atoms;
}

// 让一段文字在正常排版（浏览器真实换行）下按行从上到下依次浮现，行数
// 和断点完全交给浏览器决定，不是提前手写死几处断句。原理：每个字符/嵌
// 入元素都是一个内联小盒子（.reveal-atom），挂载后量出每个原子的
// offsetTop，同一 offsetTop 的原子判定为同一视觉行，按行号给它们统一设
// 一个 --line-delay，动画本身仍是原来的 reveal-up（淡入 + 上浮）——同一
// 行的原子共享同一个延迟，动起来就是"整行一起浮现"，不会拆成逐字蹦跳。
// 不做任何 DOM 结构改动（不把原子挪进新的行容器），只是原地设样式，
// resize 时重新量一遍、更新延迟即可，不用担心行容器和原子结构互相打架。
export function LineRevealText({
  children,
  className,
  durationMs = 700,
  staggerMs = 120,
}: {
  children: ReactNode;
  className?: string;
  durationMs?: number;
  staggerMs?: number;
}) {
  const atoms = splitToAtoms(children);
  const containerRef = useRef<HTMLDivElement>(null);
  const revealedRef = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function assignLines() {
      if (!container) return;
      const atomEls = Array.from(
        container.querySelectorAll<HTMLElement>(":scope > [data-atom]"),
      );

      let lastTop: number | null = null;
      let lineIndex = -1;
      for (const el of atomEls) {
        const top = el.offsetTop;
        if (lastTop === null || Math.abs(top - lastTop) > 2) {
          lineIndex += 1;
          lastTop = top;
        }
        el.style.setProperty("--line-delay", `${lineIndex * staggerMs}ms`);
        if (!revealedRef.current) {
          el.style.animationDuration = `${durationMs}ms`;
          el.classList.add("reveal-atom");
        }
      }
      revealedRef.current = true;
    }

    assignLines();

    let resizeTimer: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(resizeTimer);
      // 容器宽度变了断行位置会跟着变，重新量一遍、按新的行号更新
      // --line-delay。此时 revealedRef 已经是 true，只重排不重播。
      resizeTimer = setTimeout(assignLines, 150);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      clearTimeout(resizeTimer);
    };
  }, [durationMs, staggerMs]);

  return (
    <div ref={containerRef} className={className}>
      {atoms.map((atom) => (
        <span
          key={atom.key}
          data-atom
          style={atom.isElement ? { verticalAlign: "middle" } : undefined}
        >
          {atom.node}
        </span>
      ))}
    </div>
  );
}
