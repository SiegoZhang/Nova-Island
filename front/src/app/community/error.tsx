"use client";

import { useEffect } from "react";

import { SparkIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CommunityError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="py-10">
      <EmptyState
        icon={<SparkIcon className="size-6" />}
        title="页面加载出了点问题"
        description="别担心，这通常是暂时的。你可以重试一次，或稍后再来。"
        action={
          <Button size="md" onClick={reset}>
            重新加载
          </Button>
        }
      />
    </div>
  );
}
