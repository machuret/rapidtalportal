import { BrainSubNav } from "@/components/brain/BrainSubNav";

/** Shared chrome for the /brain/* section group — the pages share nothing
 *  else, so the layout only renders the sub-nav. */
export default function BrainLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <BrainSubNav />
      {children}
    </>
  );
}
