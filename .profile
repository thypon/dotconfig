## Dependencies: ruby, source-hightlight, vim, openvpn, daemonize

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
       sudo daemonize /usr/sbin/openvpn /etc/openvpn/$1.conf
}

shortprompt() {
	export PS1="$ "
}
