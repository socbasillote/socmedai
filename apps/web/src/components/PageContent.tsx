import type { ReactNode } from "react";
import { NoticeBanner } from "@/components/NoticeBanner";

type PageContentProps = {
  notice: string;
  onDismissNotice: () => void;
  children: ReactNode;
};

export function PageContent({
  notice,
  onDismissNotice,
  children,
}: PageContentProps) {
  return (
    <main className="mx-auto max-w-[1600px] p-4 sm:p-8">
      {notice && <NoticeBanner message={notice} onDismiss={onDismissNotice} />}

      {children}
    </main>
  );
}
