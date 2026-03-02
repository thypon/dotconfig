## Dependencies: zsh
# .zshrc

# Source global definitions
[ -f /etc/zshrc ] && . /etc/zshrc

. $HOME/.profile

export PATH="$HOME/.local/bin:$PATH"

command -v gls &>/dev/null && alias ls='gls --color=auto' || alias ls='ls --color=auto'

if (( $+commands[ag] )); then
  export TAG_SEARCH_PROG=ag  # replace with rg for ripgrep
  tag() { command tag "$@"; source ${TAG_ALIAS_FILE:-/tmp/tag_aliases} 2>/dev/null; }
  alias ag=tag  # replace with rg for ripgrep
fi

# Unlimited History
export HISTSIZE=30000
export SAVEHIST=30000
export HISTFILE="$HOME/.zsh_history"
setopt HIST_IGNORE_DUPS
setopt SHARE_HISTORY

HOST=$(hostname)
if [ "x$SSH_CLIENT" = "x" ] && [ "x$SSH_CONNECTION" = "x" ]; then
	export LIBVIRT_DEFAULT_URI='qemu+ssh://pme/system'
	_ps1_prefix=""
else
	export LIBVIRT_DEFAULT_URI='qemu:///system'
	_ps1_prefix="$HOST "
fi

# Set xterm title and smiley prompt
precmd() {
	local _rc=$?
	echo -ne "\033]0;$(date +%H:%M:%S)+$PWD\007"
	if [[ $_rc == 0 ]]; then
		PROMPT="${_ps1_prefix}%F{green};)%f "
	else
		PROMPT="${_ps1_prefix}%F{red}:(%f "
	fi
}
