# Dynamic JAVA_HOME: newest Homebrew openjdk, else Apple java_home.
# Sourced by ~/.zprofile (zsh login) and ~/.profile (bash login).
unset JAVA_HOME
for _jh in /opt/homebrew/opt/openjdk /opt/homebrew/opt/openjdk@*; do
  [ -d "$_jh/libexec" ] && [ -x "$_jh/libexec/openjdk.jdk/Contents/Home/bin/java" ] && JAVA_HOME="$_jh/libexec/openjdk.jdk/Contents/Home" && break
done
[ -z "$JAVA_HOME" ] && [ -x /usr/bin/java ] && JAVA_HOME="$(/usr/libexec/java_home 2>/dev/null)"
[ -n "$JAVA_HOME" ] && export PATH="$JAVA_HOME/bin:$PATH"
unset _jh
