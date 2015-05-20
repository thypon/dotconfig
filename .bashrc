## Dependencies: bash
# .bashrc

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# Source global definitions
[ -f /etc/bashrc ] && . /etc/bashrc

alias ls='ls --color=auto'
export PS1="\[$(tput sgr0)\]\033[38;5;15m\033[38;5;112m\A\[$(tput sgr0)\]\033[38;5;15m\033[38;5;15m@\[$(tput sgr0)\]\w\[$(tput sgr0)\]>\[$(tput sgr0)\] \[$(tput sgr0)\]"

. $HOME/.profile
