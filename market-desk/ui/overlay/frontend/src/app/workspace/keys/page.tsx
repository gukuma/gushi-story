"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, CircleAlert, ExternalLink, RotateCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  WorkspaceBody,
  WorkspaceContainer,
  WorkspaceHeader,
} from "@/components/workspace/workspace-container";
import { APP_NAME, deskGet, deskPost, type KeysStatus } from "@/core/stock-story/api";

const LABELS: Record<string, { name: string; why: string }> = {
  DEEPSEEK_API_KEY: { name: "DeepSeek 模型（必填）", why: "助手的“大脑”。没有它，助手不能思考和回答。" },
  TAVILY_API_KEY: { name: "Tavily 搜索", why: "让助手上网查资料，每月 1000 次免费，英文网站效果好。" },
  TENCENTCLOUD_WSA_APIKEY: { name: "腾讯云联网搜索", why: "中文网站搜索效果最好，需要腾讯云实名认证。" },
  INFOQUEST_API_KEY: { name: "字节 InfoQuest 搜索", why: "另一种搜索和网页读取服务，可选。" },
  JINA_API_KEY: { name: "Jina 网页阅读", why: "帮助助手读取网页全文。不填也能用，填了速度限制更宽。" },
  VOLCENGINE_API_KEY: { name: "火山引擎方舟（备用模型）", why: "用一个密钥调用豆包、DeepSeek、Kimi 等模型，可选。" },
  LANGSMITH_API_KEY: { name: "LangSmith 运行追踪", why: "记录助手每一步做了什么，排查问题用，可选。" },
};

const SEARCH_LABELS: Record<string, string> = {
  tavily: "Tavily",
  tencent: "腾讯云联网搜索",
  infoquest: "字节 InfoQuest",
  ddg: "DuckDuckGo（免密钥，效果一般）",
  brave: "Brave",
  serper: "Serper（Google）",
};

function activeKey(search: string | null | undefined) {
  if (!search) return "";
  if (search.startsWith("tencent")) return "tencent";
  if (search.startsWith("ddg")) return "ddg";
  return search;
}

function KeyRow({ k, onSaved }: { k: KeysStatus["keys"][number]; onSaved: () => void }) {
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const label = LABELS[k.var] ?? { name: k.var, why: k.what };
  const save = async () => {
    setSaving(true);
    try {
      await deskPost("/api/keys", { var: k.var, value });
      setValue("");
      toast.success(`${label.name} 已保存，重启后生效`);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="bg-card flex flex-col gap-2 rounded-xl border p-4" data-tip-title={label.name} data-tip={`${label.why} 把密钥粘贴到框里，点“保存”。`}>
      <div className="flex flex-wrap items-center gap-2">
        {k.set ? <CheckCircle2 className="size-4 text-emerald-600" /> : <CircleAlert className={k.required ? "size-4 text-red-600" : "text-muted-foreground size-4"} />}
        <span className="font-medium">{label.name}</span>
        <span className="text-muted-foreground font-mono text-xs">{k.var}</span>
        <span className="text-muted-foreground ml-auto text-xs">{k.set ? `已设置 ${k.masked}` : "未设置"}</span>
      </div>
      <p className="text-muted-foreground text-sm">{label.why}</p>
      <div className="flex gap-2">
        <Input type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={k.set ? "粘贴新密钥以替换" : "粘贴密钥"} autoComplete="off" />
        <Button onClick={save} disabled={!value.trim() || saving}>保存</Button>
        <Button variant="outline" asChild>
          <a href={k.url} target="_blank" rel="noopener noreferrer" data-tip-title="去申请" data-tip="打开这个服务的网站，注册后复制密钥回来粘贴。">
            申请 <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </div>
    </div>
  );
}

export default function KeysPage() {
  const qc = useQueryClient();
  const { data, error, refetch } = useQuery({ queryKey: ["stock-story", "keys"], queryFn: () => deskGet<KeysStatus>("/api/keys") });
  const [restarting, setRestarting] = useState(false);
  useEffect(() => {
    document.title = `API 密钥 - ${APP_NAME}`;
  }, []);

  const setSearch = async (name: string) => {
    try {
      const r = await deskPost<{ ok: boolean; message: string }>("/api/search", { name });
      toast[r.ok ? "success" : "error"](r.ok ? `搜索服务已切换为 ${SEARCH_LABELS[name] ?? name}，重启后生效` : r.message);
      void qc.invalidateQueries({ queryKey: ["stock-story", "keys"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const restart = async () => {
    setRestarting(true);
    try {
      const r = await deskPost<{ message: string }>("/api/restart", {});
      toast.success(r.message);
      setTimeout(() => window.location.reload(), 70_000);
    } catch (e) {
      toast.error((e as Error).message);
      setRestarting(false);
    }
  };

  return (
    <WorkspaceContainer>
      <WorkspaceHeader />
      <WorkspaceBody>
        <ScrollArea className="size-full">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="mr-auto text-2xl font-bold">API 密钥</h1>
              <Button onClick={restart} disabled={restarting} data-tip-title="保存并重启" data-tip="改完密钥或搜索服务后点这里，系统会重启（约 1 分钟），新设置才会生效。">
                <RotateCw className={restarting ? "size-4 animate-spin" : "size-4"} /> {restarting ? "重启中，约 1 分钟…" : "保存并重启"}
              </Button>
            </div>
            <p className="text-muted-foreground text-sm">
              密钥只保存在你电脑上的 <code>{data?.env_path ?? ".env"}</code> 文件里，不会上传。行情数据不需要密钥。
            </p>
            {error && <div className="rounded-xl border p-4 text-sm">投研数据服务未运行，无法读取密钥状态。</div>}

            {data && (
              <div className="bg-card rounded-xl border p-4" data-tip-title="搜索服务" data-tip="助手上网查资料用哪个服务。中文研究推荐“腾讯云联网搜索”，没有密钥时可以先用 Tavily。">
                <div className="mb-2 font-medium">网页搜索服务</div>
                <div className="flex flex-wrap gap-2">
                  {data.search_options.map((s) => (
                    <button key={s} type="button" onClick={() => setSearch(s)}
                      className={`rounded-full border px-3 py-1 text-sm ${activeKey(data.search) === s ? "bg-foreground text-background" : "hover:bg-muted"}`}>
                      {SEARCH_LABELS[s] ?? s}
                    </button>
                  ))}
                </div>
                <p className="text-muted-foreground mt-2 text-xs">当前：{SEARCH_LABELS[activeKey(data.search)] ?? data.search ?? "未知"}</p>
              </div>
            )}
            {data?.keys.map((k) => <KeyRow key={k.var} k={k} onSaved={() => void refetch()} />)}
          </div>
        </ScrollArea>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
