-- 📈 股市故事.app — 双击：如未运行则启动，然后在 Safari 打开。
property ctl : "/Users/mac/desktop/deer-flow/market-desk/mac/deskctl.sh"

on run
	display notification "正在打开…（冷启动约需 1 分钟）" with title "📈 股市故事"
	try
		do shell script "/bin/bash " & quoted form of ctl & " open --quiet"
	on error errMsg
		set r to display dialog "股市故事启动失败。" & return & return & errMsg buttons {"查看日志", "好"} default button "好" with icon caution
		if button returned of r is "查看日志" then do shell script "/bin/bash " & quoted form of ctl & " logs open"
	end try
end run
