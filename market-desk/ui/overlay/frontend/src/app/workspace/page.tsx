import { redirect } from "next/navigation";

// 📈 股市故事: the dashboard lives at "/". Old /workspace links land there.
export default function WorkspacePage() {
  redirect("/");
}
