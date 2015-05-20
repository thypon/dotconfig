if [ -d /etc/X11/xinit/xinitrc.d ]; then
	for f in /etc/X11/xinit/xinitrc.d/?* ; do
		[ -x "$f" ] && . "$f"
	done
	unset f
fi

xrdb -I$HOME $HOME/.Xresources

session=${1:-subtle}

case $session in
	subtle) exec ck-launch-session subtle;;
	kde) exec ck-launch-session startkde;;
	*) exec ck-launch-session $1;;
esac
