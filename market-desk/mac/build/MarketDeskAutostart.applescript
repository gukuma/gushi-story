-- 股市故事 自动启动 — 登录项：登录后打开“终端”运行启动脚本（make dev），就绪后 Safari 自动打开 http://localhost:2026/
property startup : "/Users/mac/desktop/deer-flow/market-desk/mac/startup.command"
property ctl : "/Users/mac/desktop/deer-flow/market-desk/mac/deskctl.sh"

on run
	delay 15 -- 等网络和系统服务就绪
	try
		do shell script "open -a Terminal " & quoted form of startup
	on error errMsg
		try
			do shell script "/bin/bash " & quoted form of ctl & " open --quiet"
		on error
			display notification "自动启动失败——打开“股市故事 工具”→ 查看日志" with title "📈 股市故事"
		end try
	end try
end run
