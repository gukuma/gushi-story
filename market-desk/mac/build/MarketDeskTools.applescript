-- 股市故事 工具.app — 常用工具菜单。
property ctl : "/Users/mac/desktop/deer-flow/market-desk/mac/deskctl.sh"

on sh(args)
	return do shell script "/bin/bash " & quoted form of ctl & " " & args
end sh

on run
	set menuItems to {"打开 📈 股市故事", "运行状态", "编辑技能…", "新建技能…", "检查技能", "编辑自选股", "打开研究库文件夹", "填写 API 密钥…", "切换搜索服务…", "语言 / Language…", "编辑 config.yaml", "重启", "停止", "查看日志", "备份研究库和技能"}
	set picked to choose from list menuItems with title "📈 股市故事 工具" with prompt "要做什么？" default items {"打开 📈 股市故事"}
	if picked is false then return
	set c to item 1 of picked
	try
		if c is "打开 📈 股市故事" then
			display notification "正在打开…" with title "📈 股市故事"
			sh("open --quiet")
		else if c is "运行状态" then
			display dialog sh("status") buttons {"好"} default button "好" with title "运行状态"
		else if c is "编辑技能…" then
			set names to paragraphs of sh("skills --names")
			set s to choose from list names with title "编辑技能" with prompt "上面是你的自定义技能，下面是内置技能。"
			if s is not false then sh("edit " & quoted form of (item 1 of s))
		else if c is "新建技能…" then
			set n to text returned of (display dialog "新技能的英文名（小写加连字符，例如 earnings-preview-zh）：" default answer "" with title "新建技能")
			set d to text returned of (display dialog "用一两句话说明：它做什么、什么时候该用它？" default answer "" with title "新建技能")
			sh("new " & quoted form of n & " " & quoted form of d)
		else if c is "检查技能" then
			try
				display dialog sh("check") buttons {"好"} default button "好" with title "技能都没问题"
			on error e
				display dialog e buttons {"好"} default button "好" with title "有技能需要修改" with icon caution
			end try
		else if c is "编辑自选股" then
			sh("watchlist")
		else if c is "打开研究库文件夹" then
			sh("library")
		else if c is "填写 API 密钥…" then
			sh("open --quiet")
			do shell script "open -a Safari 'http://localhost:2026/workspace/keys'"
		else if c is "切换搜索服务…" then
			set p to choose from list {"tencent", "tavily", "infoquest", "ddg", "brave", "serper"} with title "网页搜索服务" with prompt "助手上网查资料用哪个服务？（中文推荐 tencent）"
			if p is not false then
				display dialog sh("search " & item 1 of p) buttons {"现在重启", "稍后"} default button "现在重启" with title "搜索服务"
				if button returned of result is "现在重启" then sh("restart --quiet")
			end if
		else if c is "语言 / Language…" then
			set p to choose from list {"zh — 中文", "en — English", "both — 中英双轨"} with title "语言 / Language" with prompt sh("lang")
			if p is not false then
				set code to text 1 thru ((offset of " " in (item 1 of p)) - 1) of (item 1 of p)
				tell application "Terminal"
					activate
					do script "bash " & quoted form of ctl & " lang " & code
				end tell
			end if
		else if c is "编辑 config.yaml" then
			sh("config")
			display notification "保存后选“重启”才会生效。" with title "📈 股市故事"
		else if c is "重启" then
			display notification "正在重启…" with title "📈 股市故事"
			sh("restart --quiet")
		else if c is "停止" then
			sh("stop")
			display notification "已停止。" with title "📈 股市故事"
		else if c is "查看日志" then
			sh("logs open")
		else if c is "备份研究库和技能" then
			display dialog sh("backup") buttons {"好"} default button "好"
		end if
	on error errMsg number errNum
		if errNum is not -128 then display dialog errMsg buttons {"好"} default button "好" with icon caution
	end try
end run
