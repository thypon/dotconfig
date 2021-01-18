# Dependencies: subtle, kde, xrdb, ConsoleKit2, autocutsel, dunst, feh, xcompmgr

. $HOME/.profile

if [ -d /etc/X11/xinit/xinitrc.d ]; then
	for f in /etc/X11/xinit/xinitrc.d/?* ; do
		[ -x "$f" ] && . "$f"
	done
	unset f
fi

if [ -x /usr/bin/pulseaudio ] && [ -x /usr/bin/pactl ]; then
	pulseaudio --start --log-target=syslog
	pactl load-module module-switch-on-connect
	pactl upload-sample /usr/share/sounds/freedesktop/stereo/bell.oga x11-bell
	pactl load-module module-x11-bell sample=x11-bell display=$DISPLAY
fi

if [ -x /usr/bin/xrdb ] && [ -f $HOME/.Xresources ]; then
	xrdb -I$HOME $HOME/.Xresources
fi

if [ -x /usr/bin/autocutsel ]; then
	#this will keep the clipboard in sync
	#   with the primary buffer
	autocutsel -selection CLIPBOARD -fork

	#this will keep the primary in sync
	#   with the clipboard buffer
	# autocutsel -selection PRIMARY -fork
fi

if [ -x /usr/bin/feh ]; then
	feh --bg-max ~/background.png
fi

if [ -x /usr/bin/xdg-mime ]; then
	xdg-mime default chromium.desktop text/html
	xdg-mime default chromium.desktop x-scheme-handler/http
	xdg-mime default chromium.desktop x-scheme-handler/https
	xdg-mime default chromium.desktop x-scheme-handler/about
	xdg-mime default zathura.desktop application/pdf
fi
export BROWSER="/usr/bin/chromium"

session=${1:-subtle}

SESSION_LAUNCH="dbus-launch --exit-with-session"

case $session in
	subtle) exec $SESSION_LAUNCH bash -c "[ -x /usr/bin/dunst ] && dunst -c $HOME/.config/dunst/dunstrc &\
						[ -x /usr/bin/xcompmgr ] && xcompmgr -C &\
						/usr/share/indicator-doom-cpu/indicator-doom-cpu &\
						[ -x /usr/bin/ckb ] && ckb &\
						[ -x /usr/bin/redshift ] && redshift -l 45.393:8.9198 &\
						[ -x /usr/bin/anbox ] && anbox session-manager &\
						[ -x /usr/bin/libinput-gestures ] && sudo -ginput libinput-gestures -c $HOME/.config/gestures &\
						subtle";;
	kde) exec $SESSION_LAUNCH startkde;;
	mate) exec $SESSION_LAUNCH mate-session;;
	cinnamon) exec $SESSION_LAUNCH cinnamon-session;;
	xfce) exec $SESSION_LAUNCH startxfce4;;
	enlightenment) exec $SESSION_LAUNCH enlightenment_start;;
	gnome) exec $SESSION_LAUNCH gnome-session;;
	lxqt) exec $SESSION_LAUNCH lxqt-session;;
	*) exec $SESSION_LAUNCH $1;;
esac
