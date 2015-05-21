## Dependencies: bash, bash-preexec
# .bashrc

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# Source global definitions
[ -f /etc/bashrc ] && . /etc/bashrc

alias ls='ls --color=auto'
export PS1="\[$(tput sgr0)\]\033[38;5;15m\033[38;5;112m\A\[$(tput sgr0)\]\033[38;5;15m\033[38;5;15m@\[$(tput sgr0)\]\w\[$(tput sgr0)\]>\[$(tput sgr0)\] \[$(tput sgr0)\]"

. $HOME/.profile

# Unlimited History
export HISTSIZE=-1
export HISTFILESIZE=-1

# Source bash-preexec.sh if exists
[ -f /usr/bin/bash-preexec.sh ] && . /usr/bin/bash-preexec.sh

# Print command name xterm header
case $TERM in
	xterm*)
		preexec() {
			echo -ne "\033]0;$*\007";
		}
	;;
esac
