## Dependencies: ruby, source-hightlight, vim, openvpn, dtach, sudo, glibc

#############################
## Setup Ruby Default Path ##
#############################
export GEM_HOME=$(ruby -e 'print Gem.user_dir')
export PATH=$PATH:$GEM_HOME/bin

###################
## Colorful LESS ##
###################
export LESSOPEN="| /usr/bin/src-hilite-lesspipe.sh %s"
export LESS=' -R '

####################
## Default Editor ##
####################
export EDITOR=vim

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
       dtach -A "/tmp/vpn$1" sudo /usr/sbin/openvpn "/etc/openvpn/$1.conf"
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

##################
## Host Aliases ##
##################
export HOSTALIASES="~/.hosts"
