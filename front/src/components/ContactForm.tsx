"use client";

import { type FormEvent, useState } from "react";

const CONTACT_EMAIL = "hello@novaisland.ai";

const topics = [
  { value: "ai", label: "AI社群 加入咨询" },
  { value: "fde", label: "FDE 业务合作" },
  { value: "media", label: "媒体 / 内容合作" },
  { value: "other", label: "其他" },
] as const;

const inputClass =
  "w-full rounded-lg border border-[#efefef] bg-white px-3.5 py-2.5 text-[14px] text-[#1c1917] outline-none transition-colors focus:border-[#1c1917]";
const labelClass =
  "mb-1.5 block text-[12px] tracking-[0.06em] text-[#78716c] uppercase";

export function ContactForm() {
  const [sent, setSent] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "");
    const company = String(form.get("company") ?? "");
    const email = String(form.get("email") ?? "");
    const topic = String(form.get("topic") ?? "");
    const message = String(form.get("message") ?? "");

    const topicLabel = topics.find((t) => t.value === topic)?.label ?? "";
    const subject = `[新岛] ${topicLabel || "网站咨询"} — ${name}`;
    const body = [
      `姓名：${name}`,
      company && `公司/团队：${company}`,
      `邮箱：${email}`,
      topicLabel && `咨询方向：${topicLabel}`,
      "",
      message,
    ]
      .filter(Boolean)
      .join("\n");

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setSent(true);
  }

  if (sent) {
    return (
      <div className="rounded-2xl border border-[#efefef] bg-[#F8F8F8] p-6">
        <p className="text-[15px] leading-[1.65] text-[#1c1917]">
          已为你打开邮件客户端，确认发送后我们会尽快回复。
        </p>
        <p className="mt-2 text-[13px] text-[#78716c]">
          没有跳转？可直接发邮件到{" "}
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="underline decoration-[#efefef] underline-offset-4 hover:decoration-[#1c1917]"
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="c-name">
            姓名 <span className="text-[#fb2c36]">*</span>
          </label>
          <input
            id="c-name"
            name="name"
            type="text"
            placeholder="你的名字"
            autoComplete="name"
            required
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="c-company">
            公司 / 团队
          </label>
          <input
            id="c-company"
            name="company"
            type="text"
            placeholder="可选"
            autoComplete="organization"
            className={inputClass}
          />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="c-email">
          邮箱 <span className="text-[#fb2c36]">*</span>
        </label>
        <input
          id="c-email"
          name="email"
          type="email"
          placeholder="your@email.com"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="c-topic">
          咨询方向
        </label>
        <select
          id="c-topic"
          name="topic"
          defaultValue=""
          className={`${inputClass} cursor-pointer appearance-none`}
        >
          <option value="">请选择</option>
          {topics.map((topic) => (
            <option key={topic.value} value={topic.value}>
              {topic.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="c-message">
          留言 <span className="text-[#fb2c36]">*</span>
        </label>
        <textarea
          id="c-message"
          name="message"
          rows={5}
          placeholder="告诉我们你的需求或问题…"
          required
          className={`${inputClass} resize-none`}
        />
      </div>

      <div>
        <button
          type="submit"
          className="inline-flex items-center justify-center rounded-full bg-[#1c1917] px-6 py-3 text-[14px] font-medium tracking-[-0.01em] text-white transition-colors hover:bg-black active:scale-[0.97]"
        >
          发送留言
        </button>
      </div>

      <p className="text-[12px] text-[#78716c]">
        你的信息仅用于回复本次咨询，不会用于其他用途。
      </p>
    </form>
  );
}
