## Dependencies: ruby, source-hightlight, vim, openvpn, dtach, sudo, glibc

#############################
## Setup Ruby Default Path ##
#############################
if which rbenv > /dev/null; then 
	eval "$(rbenv init -)";
else
	export GEM_HOME=$(ruby -e 'require "rubygems"; print Gem.user_dir')
	export PATH=$PATH:$GEM_HOME/bin
fi

###############################
## Setup Nodejs Default Path ##
###############################
export NPM_PACKAGES="$HOME/.npm-packages"
[ ! -n "$NPM_PACKAGES" ] && mkdir -p "$NPM_PACKAGES"
echo "prefix = $NPM_PACKAGES" > $HOME/.npmrc
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
export LESSOPEN="| src-hilite-lesspipe.sh %s"
export LESS=' -R '
export PAGER='less'

####################
## Default Editor ##
####################
export EDITOR=nvim
alias subl=sublime
command -v subl3 &>/dev/null && alias subl=subl3

#########################
## Libvirt default URI ##
#########################
export LIBVIRT_DEFAULT_URI="qemu:///system"
export QEMU_AUDIO_DRV=pa

###############
## Short PS1 ##
###############
shortprompt() {
	export PS1="$ "
}

repo_prompt() {
	export PS1='$(REPO_DIR=$(repo_dir); echo -n ${REPO_DIR##*/}) '
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
if [ "x$SSH_CLIENT" = "x" ] && command -v notify-send &>/dev/null; then
	alias alert='notify-send --urgency=low -i shell "command has terminated"'
else
	alias alert='echo "command has terminated\a"'
fi
focus() {
	if [ "x$SSH_CLIENT" = "x" ]; then
		local focus=$(ruby -e 'require "subtle/subtlext"; print Subtlext::Client.all.select { |c| c.win == ENV["WINDOWID"].to_i }.first.has_focus?')
	else
		local focus=true
	fi
	[ "$focus" = "true" ]
}
##################
## Host Aliases ##
##################
export HOSTALIASES="~/.hosts"

##################################################
## (C)ontext Sensitive CD Wrapper for (L)oosers ##
##################################################
alias c="cl"
alias l="ls -la"

###################
## Setup Aliases ##
###################
alias schroot="schroot -p"
alias pinstall="pip install --user"

######################
## Setup Local Path ##
######################
export PATH="$HOME/.local/bin:$HOME/.opencode/bin:$PATH"

####################
## Setup Opt Path ##
####################
export PATH="$PATH:/opt/freeplane"

#################
## Misc Config ##
#################
CHROME_FLAGS+=" --force-device-scale-factor=1.2 "

alias meteo='curl -4 http://wttr.in/Milan'
alias dia='dia --integrated'
alias broken='grep -Polz "(?s)miwaxe.*[^\t ]broken" srcpkgs/*/template'

####################
# Github Org Clone #
####################
org_clone() {
	last="${@: -1}" # last parameter
	set -- "${@:1:$(($#-1))}" # drop last parameter; remaining args in $@
	for F in $(curl https://api.github.com/orgs/$last/repos | jq '.[] | .git_url' | tr -d '"'); do
		git clone "$@" $F
	done
}

################
# Brew Support #
################
export HOMEBREW_PREFIX="/opt/homebrew";
export HOMEBREW_CELLAR="/opt/homebrew/Cellar";
export HOMEBREW_REPOSITORY="/opt/homebrew";
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin${PATH+:$PATH}";
export MANPATH="/opt/homebrew/share/man${MANPATH+:$MANPATH}:";
export INFOPATH="/opt/homebrew/share/info:${INFOPATH:-}";

################
# Ansible Vars #
################
export ANSIBLE_HOSTS=~/Documents/ansible_hosts

###############
#  KeyChain   #
###############
command -v keychain &>/dev/null && eval $(keychain --noask --eval --quiet)

########
# JAVA #
########
unset JAVA_HOME
[ -f /etc/profile.d/11_oracle-jdk.sh ] && source /etc/profile.d/11_oracle-jdk.sh
export ANDROID_HOME=$HOME/.android-sdk
export ANDROID_NDK=$HOME/.android-ndk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_NDK

############
# LuaRocks #
############
export PATH="$HOME/.luarocks/bin:$PATH"

#########
# Fonts #
#########
export FT2_SUBPIXEL_HINTING=1

###############
# VM location #
###############
export PATH="$HOME/.vms/bin:$PATH"

#############################
# Private Profile if exists #
#############################
[ -f $HOME/.private_profile ] && source $HOME/.private_profile

####################################################
# Disable Annoying macOS BASH deprecation warnings #
####################################################
export BASH_SILENCE_DEPRECATION_WARNING=1

###################
# Disable Wayland #
###################
export QT_QPA_PLATFORM=xcb
export GDK_BACKEND=x11

########################
# MacOS Open on Unixes #
########################
type -p open 1>/dev/null || alias open=xdg-open