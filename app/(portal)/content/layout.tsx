import { Suspense } from "react";
import { ContentSectionNav } from "@/components/content/ContentSectionNav";

export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <ContentSectionNav />
      </Suspense>
      {children}
    </>
  );
}
