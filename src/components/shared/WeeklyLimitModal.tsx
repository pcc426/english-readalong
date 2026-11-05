"use client";

import { useRouter } from "next/navigation";
import { WEEKLY_RUN_LIMIT } from "@/lib/domain/limits";
import { Modal } from "./Modal";

export function WeeklyLimitModal({
  open,
  onClose,
  contentType,
}: {
  open: boolean;
  onClose: () => void;
  contentType: "standard" | "custom";
}) {
  const router = useRouter();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="本周挑战次数用完啦"
      leading={
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-4xl">
          🌟
        </div>
      }
      primaryLabel="去练其他内容"
      onPrimary={() => {
        onClose();
        router.push(contentType === "standard" ? "/units" : "/custom");
      }}
      secondaryLabel="知道了"
      onSecondary={onClose}
    >
      <p className="mt-4 text-lg leading-relaxed text-slate-600">
        这个内容本周已经挑战 {WEEKLY_RUN_LIMIT} 次啦，下周再来挑战，先试试其他内容吧！
      </p>
      <p className="mt-4 text-xs text-slate-400">下周一自动重置</p>
    </Modal>
  );
}
