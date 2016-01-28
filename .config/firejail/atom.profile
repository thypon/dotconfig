noblacklist ${HOME}/.atom/
noblacklist ${HOME}/.config/Atom/
include /etc/firejail/disable-mgmt.inc
include /etc/firejail/disable-secret.inc
include /etc/firejail/disable-common.inc

netfilter
whitelist ${DOWNLOADS}
whitelist ~/Workspace
whitelist ~/Documents
whitelist ~/Desktop
include /etc/firejail/whitelist-common.inc
