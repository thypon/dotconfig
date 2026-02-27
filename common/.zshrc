## Dependencies: zsh
# .zshrc

# Source global definitions
[ -f /etc/zshrc ] && . /etc/zshrc

. $HOME/.profile

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

# Print command name xterm header
case $TERM in
	xterm*)
		export PROMPT="$ "
		preexec() {
			echo -ne "\033]0;$1:$PWD\007";
		}
	;;
esac
