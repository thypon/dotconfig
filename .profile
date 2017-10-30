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
export PAGER='less'

####################
## Default Editor ##
####################
export EDITOR=nvim

#########################
## Libvirt default URI ##
#########################
export LIBVIRT_DEFAULT_URI="qemu:///system"
export QEMU_AUDIO_DRV=pa

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

#########################
## Intelligent Aliases ##
#########################
alias wget="wget -c" # Continue Interrupted downloads
alias zyboconn="picocom -l -b 115200 /dev/ttyUSB1" # Connect to the zybo board
alias usbarmoryconn="picocom -b 115200 -r -l /dev/ttyUSB0" # Connect to the usbarmory board
RADIOS="http://mp3.kataweb.it:8000/M2O http://mp3.kataweb.it:8000/RadioDeejay http://shoutcast.unitedradio.it:1301"
alias radio="while true; do mplayer $RADIOS; done"
alias e="nvim"
alias g="git"
alias gg="g g"
alias gt="g t"
alias ga="g a"
alias groot='cd $(git root)'
alias t="tig"
alias alert='notify-send --urgency=low -i shell "command has terminated"'
focus() {
	local focus=$(ruby -e 'require "subtle/subtlext"; print Subtlext::Client.all.select { |c| c.win == ENV["WINDOWID"].to_i }.first.has_focus?')
	[ "$focus" = "true" ]
}
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

updateclock() {
	sudo date -s "$(curl -s --head http://google.com | grep ^Date: | sed 's/Date: //g')"
	sudo hwclock -w --utc
	sudo hwclock -r --utc
}

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
	[ $upd == "" ] && echo "package alredy updated" && return 0
	sed -i "s/^version=.*/version=$upd/" "srcpkgs/$1/template"
	sed -i "s/^revision=.*/revision=1/"  "srcpkgs/$1/template"
	xgensum -i "srcpkgs/$1/template"
	xbump $1
}
xlazy() {
	for pkg in "$@"; do
		xupdate ${pkg} && ./xbps-src -j4 pkg ${pkg} || git reset --hard HEAD~1
	done
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

###############
## To Update ##
###############
toupdate() {
	curl 'https://repo.voidlinux.eu/void-updates/void-updates/updates_abc%40pompel.me.txt'
}

pdfpages() {
	( for pdf in *.pdf ; do pdfinfo "$pdf" ; done ) | grep Pages | sed 's/[^0-9]*//' | paste -sd+ | bc
}
alias meteo='curl -4 http://wttr.in/Milan'
alias dia='dia --integrated'
alias broken='grep -Polz "(?s)miwaxe.*[^\t ]broken" srcpkgs/*/template'

##########################
# Compile Android Kernel #
##########################
akernel() {
	#make ARCH=arm CROSS_COMPILE=../../../prebuilts/gcc/linux-x86/arm/arm-eabi-4.8/bin/arm-eabi- -j8 zImage

	local DTS_FILES=$(perl -e 'while (<>) {$a = $1 if /CONFIG_ARCH_((?:MSM|QSD|MPQ)[a-zA-Z0-9]+)=y/; $r = $1 if /CONFIG_MSM_SOC_REV_(?!NONE)(\w+)=y/; $arch = $arch.lc("$a$r ") if /CONFIG_ARCH_((?:MSM|QSD|MPQ)[a-zA-Z0-9]+)=y/} print $arch;' .config)
	cp ./arch/arm/boot/zImage /tmp/zImage.tmp
	for DTS in $(find arch/arm/boot/dts/ | grep $DTS_FILES | egrep "\.dts$"); do
		dtc -p 1024 -O dtb -o /tmp/file.dtb $DTS
		cat /tmp/zImage.tmp /tmp/file.dtb > /tmp/zImage
		mv /tmp/zImage /tmp/zImage.tmp
	done
	local TDIR=$(mktemp -d)
	#mv /tmp/zImage.tmp $TDIR/boot.img-zImage
	python -c "from droidtools import unpackbootimg; unpackbootimg.extract('boot.img', '$TDIR').build('out.img')"
}

###############################################
# Merge different repos in a unique directory #
###############################################
mergedir() {
	local REPO="$1"
	local SUBDIR="$2"
	local BRANCH="$3"
	local REMOTE="$(echo $SUBDIR | sed 's|/|-|g')"
	git remote add $REMOTE $REPO
	git fetch $REMOTE
	git merge -s ours --no-commit --allow-unrelated-histories $REMOTE/$BRANCH
	git read-tree --prefix=$SUBDIR -u $REMOTE/$BRANCH
	git commit
}

###################################################
# Extract a Docker image in the current directory #
###################################################
extractimage() {
	docker export `docker run -d --entrypoint="true" $1` | sudo tar xf - -C $PWD
	sudo mkdir -p $PWD/etc/sudoers.d
}

################
# Brew Support #
################
export PATH="$HOME/.linuxbrew/bin:$PATH"
export MANPATH="$HOME/.linuxbrew/share/man:$MANPATH"
export INFOPATH="$HOME/.linuxbrew/share/info:$INFOPATH"

################
# Ansible Vars #
################
export ANSIBLE_HOSTS=~/Documents/ansible_hosts

###############
#  KeyChain   #
###############
eval $(keychain --noask --eval --quiet)

########
# JAVA #
########
unset JAVA_HOME
source /etc/profile.d/11_oracle-jdk.sh
export ANDROID_HOME=$HOME/.android-sdk
export ANDROID_NDK=$HOME/.android-ndk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_NDK

#########################
# Replace String Easily #
#########################
replace() {
  sed -i "s/$(echo $1 | sed -e 's/\([[\/.*]\|\]\)/\\&/g')/$(echo $2 | sed -e 's/[\/&]/\\&/g')/g" $3
}

############
# LuaRocks #
############
export PATH="$HOME/.luarocks/bin:$PATH"

#########
# Fonts #
#########
export _JAVA_OPTIONS='-Dswing.defaultlaf=com.sun.java.swing.plaf.gtk.GTKLookAndFeel -Dawt.useSystemAAFontSettings=lcd'
export FT2_SUBPIXEL_HINTING=1

###############
# VM location #
###############
export PATH="$HOME/.vms/bin:$PATH"
