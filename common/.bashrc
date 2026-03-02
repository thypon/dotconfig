## Dependencies: bash, bash-preexec
# .bashrc

# If not running interactively, don't do anything
[[ $- != *i* ]] && return

# Source global definitions
[ -f /etc/bashrc ] && . /etc/bashrc

. $HOME/.profile

command -v gls &>/dev/null && alias ls='gls --color=auto' || alias ls='ls --color=auto'

HOST=$(hostname)
if [ "x$SSH_CLIENT" = "x" ] && [ "x$SSH_CONNECTION" = "x" ]; then
	export LIBVIRT_DEFAULT_URI='qemu+ssh://pme/system'
	_ps1_prefix=""
else
	export LIBVIRT_DEFAULT_URI='qemu:///system'
	_ps1_prefix="$HOST "
fi

if hash ag 2>/dev/null; then
  export TAG_SEARCH_PROG=ag  # replace with rg for ripgrep
  tag() { command tag "$@"; source ${TAG_ALIAS_FILE:-/tmp/tag_aliases} 2>/dev/null; }
  alias ag=tag  # replace with rg for ripgrep
fi

# Unlimited History
export HISTSIZE=30000
export HISTFILESIZE=30000

# Source bash-preexec.sh if exists
[ -f /usr/bin/bash-preexec.sh ] && . /usr/bin/bash-preexec.sh

# Smiley prompt with xterm title via bash-preexec
PS1='${_ps1_prefix}$(if [[ $? == 0 ]]; then echo -ne "\E[32m;)\E[0m"; else echo -ne "\E[31m:(\E[0m"; fi) '
preexec() {
	echo -ne "\033]0;$(date +%H:%M:%S)+$PWD\007";
}
