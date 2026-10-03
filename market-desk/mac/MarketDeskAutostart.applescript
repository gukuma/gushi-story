-- Market Desk Autostart.app — login item: start DeerFlow + dashboard in the background, no windows.
property ctl : "__DESKCTL__"

on run
	delay 20 -- let the network and Docker/Homebrew services settle after login
	try
		do shell script "/bin/bash " & quoted form of ctl & " start --quiet"
	on error errMsg
		display notification "Autostart failed — open Market Desk Tools → View logs" with title "Market Desk"
	end try
end run
