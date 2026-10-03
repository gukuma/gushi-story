-- Market Desk.app — double-click: start DeerFlow + dashboard if needed, then open both.
property ctl : "__DESKCTL__"

on run
	display notification "Opening… (a cold start can take a minute)" with title "Market Desk"
	try
		do shell script "/bin/bash " & quoted form of ctl & " open --quiet"
	on error errMsg
		set r to display dialog "Market Desk couldn't start." & return & return & errMsg buttons {"Show logs", "OK"} default button "OK" with icon caution
		if button returned of r is "Show logs" then do shell script "/bin/bash " & quoted form of ctl & " logs open"
	end try
end run
