import { describe, expect, it } from "vitest";

import { safeImageSrc, safeLinkHref } from "@/components/community/MarkdownContent";

describe("safeLinkHref：链接协议白名单", () => {
  it("放行 http / https / mailto", () => {
    expect(safeLinkHref("https://example.com/a")).toBe("https://example.com/a");
    expect(safeLinkHref("http://example.com")).toBe("http://example.com");
    expect(safeLinkHref("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("放行站内相对路径与锚点", () => {
    expect(safeLinkHref("/community/p_1")).toBe("/community/p_1");
    expect(safeLinkHref("/media/x.png")).toBe("/media/x.png");
    expect(safeLinkHref("#section")).toBe("#section");
  });

  it("裸域名补 https", () => {
    expect(safeLinkHref("example.com/x")).toBe("https://example.com/x");
  });

  it("拦截 javascript: 协议", () => {
    expect(safeLinkHref("javascript:alert(1)")).toBeNull();
    expect(safeLinkHref("JavaScript:alert(1)")).toBeNull();
    expect(safeLinkHref("  javascript:alert(1)")).toBeNull();
  });

  it("拦截大小写与内嵌控制字符的绕过变体", () => {
    // java\tscript: / java\nscript: 去掉控制字符后仍应识别为 javascript
    expect(safeLinkHref(`java${String.fromCharCode(9)}script:alert(1)`)).toBeNull();
    expect(safeLinkHref(`java${String.fromCharCode(10)}script:alert(1)`)).toBeNull();
    expect(safeLinkHref(`java${String.fromCharCode(0)}script:alert(1)`)).toBeNull();
  });

  it("拦截 data: / vbscript: / file: 等非白名单协议", () => {
    expect(
      safeLinkHref("data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=="),
    ).toBeNull();
    expect(safeLinkHref("vbscript:msgbox(1)")).toBeNull();
    expect(safeLinkHref("file:///etc/passwd")).toBeNull();
  });

  it("空值与纯空白返回 null", () => {
    expect(safeLinkHref("")).toBeNull();
    expect(safeLinkHref("   ")).toBeNull();
  });
});

describe("safeImageSrc：图片 src 白名单", () => {
  it("放行 http / https / 站内路径", () => {
    expect(safeImageSrc("https://cdn.example.com/a.png")).toBe(
      "https://cdn.example.com/a.png",
    );
    expect(safeImageSrc("/media/import/a.jpg")).toBe("/media/import/a.jpg");
  });

  it("放行 data:image/* 内联图", () => {
    expect(safeImageSrc("data:image/png;base64,iVBORw0KGgo=")).toBe(
      "data:image/png;base64,iVBORw0KGgo=",
    );
  });

  it("拦截 data:text/html 与 javascript:", () => {
    expect(safeImageSrc("data:text/html;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
    expect(safeImageSrc("javascript:alert(1)")).toBeNull();
  });
});
