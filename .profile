## Dependencies: ruby, source-hightlight, vim, openvpn, dtach, sudo, glibc

#############################
## Setup Ruby Default Path ##
#############################
export GEM_HOME=$(ruby -e 'require "rubygems"; print Gem.user_dir')
export PATH=$PATH:$GEM_HOME/bin

###############################
## Setup Nodejs Default Path ##
###############################
export NPM_PACKAGES="$HOME/.npm-packages"
[ ! -n "$NPM_PACKAGES" ] && mkdir -p "$NPM_PACKAGES"
export PATH="$NPM_PACKAGES/bin:$PATH"
export NODE_PATH="$NPM_PACKAGES/lib/node_modules:$NODE_PATH"

###############################
## Setup Golang Default Path ##
###############################
export GOPATH=~/.go
export PATH="$PATH:$GOPATH/bin"

###################
## Colorful LESS ##
###################
export LESSOPEN="| /usr/bin/src-hilite-lesspipe.sh %s"
export LESS=' -R '

####################
## Default Editor ##
####################
export EDITOR=vim

#########################
## Libvirt default URI ##
#########################
export LIBVIRT_DEFAULT_URI="qemu:///system"

####################
## Time functions ##
####################
countdown() {
	date1=$((`date +%s` + $1));
	while [ "$date1" -ne `date +%s` ]; do
		echo -ne "$(date -u --date @$(($date1 - `date +%s`)) +%H:%M:%S)\r";
		sleep 0.1
	done
}

stopwatch() {
	date1=`date +%s`;
	while true; do
		echo -ne "$(date -u --date @$((`date +%s` - $date1)) +%H:%M:%S)\r";
		sleep 0.1
	done
}

###################
## VPN Functions ##
###################
vpn() {
       dtach -A "/tmp/vpn$1" sudo /usr/bin/openvpn "/etc/openvpn/$1.conf"
}

###############
## Short PS1 ##
###############
shortprompt() {
	export PS1="$ "
}

########################
## Intelligen Aliases ##
########################
alias wget="wget -c" # Continue Interrupted downloads
alias zyboconn="picocom -l -b 115200 /dev/ttyUSB1" # Connect to the zybo board
RADIOS="http://mp3.kataweb.it:8000/M2O http://mp3.kataweb.it:8000/RadioDeejay http://shoutcast.unitedradio.it:1301"
alias radio="while true; do mplayer $RADIOS; done"

##################
## Host Aliases ##
##################
export HOSTALIASES="~/.hosts"

##################################################
## (C)ontext Sensitive CD Wrapper for (L)oosers ##
##################################################
cl() {
	cd $@
	ls -la
}
alias c="cl"
alias l="ls -la"

###################
## Setup Aliases ##
###################
alias schroot="schroot -p"
alias pinstall="pip install --user"
alias virsh="virsh -c qemu:///system"

######################
## Setup Local Path ##
######################
export PATH="$HOME/.local/bin:$PATH"

####################
## Setup Opt Path ##
####################
export PATH="$PATH:/opt/freeplane"

#######################
## VoidLinux Helpers ##
#######################
xupdate() {
	upd=$(./xbps-src update-check $1 | tr '-' '\n' | tail -n1)
	[ upd == "" ] && echo "package alredy updated" && exit 0
	sed -i "s/^version=.*/version=$upd/" "srcpkgs/$1/template"
	sed -i "s/^revision=.*/revision=1/"  "srcpkgs/$1/template"
	xgensum -i "srcpkgs/$1/template"
	xbump $1
}
#################
## Misc Config ##
#################
CHROME_FLAGS+=" --force-device-scale-factor=1.2 "

##################
## Remove Noise ##
##################
denoise() {
	ffmpeg -i $1 -vcodec libx264 -crf 24 -preset slow -filter:v hqdn3d=4.0:3.0:6.0:4.5 -af "bandpass=f=900:width_type=h:w=600" -acodec aac -strict experimental -ab 192k $2
}

#################################
## Add Study Session Recurrent ##
#################################
mnemo() {
	ruby -e 'require "date"; print (Date.today + ARGV[0].to_i).strftime "%Y %b %d, "' 1 >> $HOME/Documents/calendar
	echo "$@" >> $HOME/Documents/calendar
	ruby -e 'require "date"; print (Date.today + ARGV[0].to_i).strftime "%Y %b %d, "' 7 >> $HOME/Documents/calendar
	echo "$@" >> $HOME/Documents/calendar
	ruby -e 'require "date"; print (Date.today + ARGV[0].to_i).strftime "%Y %b %d, "' 14 >> $HOME/Documents/calendar
	echo "$@" >> $HOME/Documents/calendar
	ruby -e 'require "date"; print (Date.today + ARGV[0].to_i).strftime "%Y %b %d, "' 28 >> $HOME/Documents/calendar
	echo "$@" >> $HOME/Documents/calendar
}

##################
## Source 2 PDF ##
##################
src2rtf() {
	local noext="${1%.*}"
	pygmentize -f rtf -O full -o "$noext.rtf" "$1"
}
