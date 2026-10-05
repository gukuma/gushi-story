import { PageLoader } from "@/components/workspace/stock-story/ui";

// Shown instantly while a page is being prepared (also during first-time compiles in dev mode).
export default function Loading() {
  return <PageLoader />;
}
