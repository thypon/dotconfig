# Dependencies: subtle, kde, xrdb, ConsoleKit2, autocutsel, dunst, bgs

. $HOME/.profile

if [ -d /etc/X11/xinit/xinitrc.d ]; then
	for f in /etc/X11/xinit/xinitrc.d/?* ; do
		[ -x "$f" ] && . "$f"
	done
	unset f
fi

if [ -x /usr/bin/xrdb ] && [ -f $HOME/.Xresources ]; then
	xrdb -I$HOME $HOME/.Xresources
fi

if [ -x /usr/bin/autocutsel ]; then
	#this will keep the clipboard in sync
	#   with the primary buffer
	# autocutsel -selection CLIPBOARD -fork

	#this will keep the primary in sync
	#   with the clipboard buffer
	autocutsel -selection PRIMARY -fork
fi

if [ -x /usr/bin/bgs ]; then
	bgs -R ~/background.png
fi

if [ -x /usr/bin/xdg-mime ]; then
	xdg-mime default chromium.desktop text/html
	xdg-mime default chromium.desktop x-scheme-handler/http
	xdg-mime default chromium.desktop x-scheme-handler/https
	xdg-mime default chromium.desktop x-scheme-handler/about
fi
export BROWSER="/usr/bin/chromium"

session=${1:-subtle}

case $session in
	subtle) exec ck-launch-session bash -c "dunst & subtle";;
	kde) exec ck-launch-session startkde;;
	mate) exec ck-launch-session mate-session;;
	cinnamon) exec ck-launch-session cinnamon-session;;
	xfce) exec ck-launch-session startxfce4;;
	enlightenment) exec ck-launch-session enlightenment_start;;
	gnome) exec ck-launch-session gnome-session;;
	*) exec ck-launch-session $1;;
esac
