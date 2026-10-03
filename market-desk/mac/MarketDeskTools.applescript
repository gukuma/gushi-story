-- Market Desk Tools.app — a menu of everyday utilities.
property ctl : "__DESKCTL__"

on sh(args)
	return do shell script "/bin/bash " & quoted form of ctl & " " & args
end sh

on run
	set menuItems to {"Open DeerFlow + dashboard", "打开中文看板 Mandarin dashboard", "Language / 语言…", "Status", "Edit a skill…", "New skill…", "Check skills", "Edit watchlist", "Open research library", "Edit config.yaml", "Set API keys…", "Switch search provider…", "Edit API keys (.env)", "Restart", "Stop", "View logs", "Back up library & skills"}
	set picked to choose from list menuItems with title "Market Desk" with prompt "What would you like to do?" default items {"Open DeerFlow + dashboard"}
	if picked is false then return
	set c to item 1 of picked
	try
		if c is "Open DeerFlow + dashboard" then
			display notification "Opening…" with title "Market Desk"
			sh("open --quiet")
		else if c is "打开中文看板 Mandarin dashboard" then
			sh("zh")
		else if c is "Language / 语言…" then
			set cur to sh("lang")
			set p to choose from list {"en — English", "zh — 中文", "both — 中英双轨"} with title "Language / 语言" with prompt cur & return & return & "Agents, skills, scheduled briefs and the dashboard follow this. 智能体、技能、定时简报与看板都会跟随切换。"
			if p is not false then
				set code to text 1 thru ((offset of " " in (item 1 of p)) - 1) of (item 1 of p)
				tell application "Terminal"
					activate
					do script "bash " & quoted form of ctl & " lang " & code
				end tell
			end if
		else if c is "Status" then
			display dialog sh("status") buttons {"OK"} default button "OK" with title "Market Desk status"
		else if c is "Edit a skill…" then
			set names to paragraphs of sh("skills --names")
			set s to choose from list names with title "Edit a skill" with prompt "Your custom skills are listed first; built-in skills after."
			if s is not false then sh("edit " & quoted form of (item 1 of s))
		else if c is "New skill…" then
			set n to text returned of (display dialog "Name for the new skill (lowercase-with-hyphens, e.g. earnings-preview):" default answer "" with title "New skill")
			set d to text returned of (display dialog "One or two sentences: what does it do, and when should the agent use it?" default answer "" with title "New skill")
			sh("new " & quoted form of n & " " & quoted form of d)
		else if c is "Check skills" then
			try
				set out to sh("check")
				display dialog out buttons {"OK"} default button "OK" with title "Skills look good"
			on error e
				display dialog e buttons {"OK"} default button "OK" with title "Skill problems" with icon caution
			end try
		else if c is "Edit watchlist" then
			sh("watchlist")
		else if c is "Open research library" then
			sh("library")
		else if c is "Edit config.yaml" then
			sh("config")
			display notification "After saving, choose Restart so DeerFlow picks up the change." with title "Market Desk"
		else if c is "Set API keys…" then
			tell application "Terminal"
				activate
				do script "bash " & quoted form of ctl & " keys set; bash " & quoted form of ctl & " keys test; bash " & quoted form of ctl & " restart"
			end tell
		else if c is "Switch search provider…" then
			set p to choose from list {"tavily", "tencent", "infoquest", "ddg", "brave", "serper"} with title "Web search" with prompt "Which search provider should DeerFlow use?"
			if p is not false then
				display dialog sh("search " & item 1 of p) buttons {"Restart now", "Later"} default button "Restart now" with title "Search provider"
				if button returned of result is "Restart now" then sh("restart --quiet")
			end if
		else if c is "Edit API keys (.env)" then
			sh("env")
			display notification "After saving, choose Restart so DeerFlow picks up the change." with title "Market Desk"
		else if c is "Restart" then
			display notification "Restarting…" with title "Market Desk"
			sh("restart --quiet")
		else if c is "Stop" then
			sh("stop")
			display notification "Stopped." with title "Market Desk"
		else if c is "View logs" then
			sh("logs open")
		else if c is "Back up library & skills" then
			display dialog sh("backup") buttons {"OK"} default button "OK"
		end if
	on error errMsg number errNum
		if errNum is not -128 then display dialog errMsg buttons {"OK"} default button "OK" with icon caution
	end try
end run
