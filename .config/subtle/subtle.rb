# -*- encoding: utf-8 -*-
## Dependencies: xterm, ponymix, synclient, xrandr, dmenu, trollock
#
# Author::  Christoph Kappel <unexist@subforge.org>
# Author::  Andrea Brancaleoni <miwaxe@gmail.com>
# Version:: $Id$
# License:: GNU GPLv2
#

#
# == Options
#
# Following options change behaviour and sizes of the window manager:
#

# Window move/resize steps in pixel per keypress
set :increase_step, 5

# Window screen border snapping
set :border_snap, 10

# Default starting gravity for windows. Comment out to use gravity of
# currently active client
set :default_gravity, :center

# Make dialog windows urgent and draw focus
set :urgent_dialogs, false

# Honor resize size hints globally
set :honor_size_hints, false

# Enable gravity tiling for all gravities
set :gravity_tiling, false

# Enable click-to-focus focus model
set :click_to_focus, true

# Skip pointer movement on e.g. gravity change
set :skip_pointer_warp, false

# Skip pointer movement to urgent windows
set :skip_urgent_warp, false

# Set the WM_NAME of subtle (Java quirk)
set :wmname, "LG3D"

#
# == Screen
#
# Generally subtle comes with two panels per screen, one on the top and one at
# the bottom. Each panel can be configured with different panel items and
# sublets screen wise. The default config uses top panel on the first screen
# only, it's up to the user to enable the bottom panel or disable either one
# or both.

# === Properties
#
# [*stipple*]    This property adds a stipple pattern to both screen panels.
#
#                Example: stipple "~/stipple.xbm"
#                         stipple Subtlext::Icon.new("~/stipple.xbm")
#
# [*top*]        This property adds a top panel to the screen.
#
#                Example: top [ :views, :title ]
#
# [*bottom*]     This property adds a bottom panel to the screen.
#
#                Example: bottom [ :views, :title ]

#
# Following items are available for the panels:
#
# [*:views*]     List of views with buttons
# [*:title*]     Title of the current active window
# [*:tray*]      Systray icons (Can be used only once)
# [*:keychain*]  Display current chain (Can be used only once)
# [*:sublets*]   Catch-all for installed sublets
# [*:sublet*]    Name of a sublet for direct placement
# [*:spacer*]    Variable spacer (free width / count of spacers)
# [*:center*]    Enclose items with :center to center them on the panel
# [*:separator*] Insert separator
#
# Empty panels are hidden.
#
# === Links
#
# http://subforge.org/projects/subtle/wiki/Multihead
# http://subforge.org/projects/subtle/wiki/Panel
#

screen 1 do
  bottom    [ :views, :spacer, :keychain, :title, :spacer, :tray, :sublets ]
  top       [ ]
end

# Example for a second screen:
screen 2 do
  top    [ ]
  bottom [ :views, :spacer, :tray, :title]
end

screen 3 do
  top    [ ]
  buttom [ :views, :spacer, :tray, :title]
end

#
# == Styles
#
# Styles define various properties of styleable items in a CSS-like syntax.
#
# If no background color is given no color will be set. This will ensure a
# custom background pixmap won't be overwritten.
#
# Following properties are available for most the styles:
#
# [*foreground*] Foreground text color
# [*background*] Background color
# [*margin*]     Outer spacing
# [*border*]     Border color and size
# [*padding*]    Inner spacing
# [*font*]       Font string (xftontsel or xft)
#
# === Link
#
# http://subforge.org/projects/subtle/wiki/Styles

# Style for all style elements
class ColorUnit
  def initialize(other)
    @num = if other < 0
      0
    elsif other > 255
      255
    else
      other
    end
  end

  def +(other)
    if @num + other > 255
      255
    else
      @num + other
    end
  end

  def -(other)
    if @num - other < 0
      0
    else
      @num - other
    end
  end

  private
  def method_missing(method, *args, &block)
    @num.send(method, *args, &block)
  end
end

def to_color s
  Color.new(
    s[1..2].hex,
    s[3..4].hex,
    s[5..6].hex)
end

class Color
  attr_reader :r, :g, :b
  def initialize(r, g, b)
    @r = ColorUnit.new(r)
    @g = ColorUnit.new(g)
    @b = ColorUnit.new(b)
  end

  def darken(percentage)
   Color.new(
      (@r + (- @r * percentage / 100)).to_i,
      (@g + (- @g * percentage / 100)).to_i,
      (@b + (- @b * percentage / 100)).to_i)
  end

  def lighten(percentage)
    self.darken(-percentage)
  end

  def to_s
    '#' + "%02x" % @r + "%02x" % @g + "%02x" % @b
  end
end

color = `python .config/colorz.py ~/background.png 3`.split.sort { |x, y| x[1..-1] <=> y[1..-1] }.map { |e| to_color(e) }

first = color[0] || to_color("#202020")
second = color[1].lighten(100) || to_color("#757575")
third = first.lighten(50)
fourth = color[2] || to_color("#fecf35")
fifth = fourth.lighten(50)
sixt = fifth.lighten(50)

puts color

style :all do
  background  first.to_s
  icon        second.to_s
  border      third.to_s, 0
  padding     0, 3
  font        "xft:Inconsolata:style=Regular:size=18"
end

# Style for the all views
style :views do
  foreground  second.to_s

  # Style for the active views
  style :focus do
    foreground  fourth.to_s
  end

  # Style for urgent window titles and views
  style :urgent do
    foreground  fifth.to_s
  end

  # Style for occupied views (views with clients)
  style :occupied do
    foreground  sixt.to_s
  end
end

# Style for sublets
style :sublets do
  foreground  second.to_s
end

# Style for separator
style :separator do
  foreground  second.to_s
  separator   "·"
end

# Style for focus window title
style :title do
  foreground  fourth.to_s
end

# Style for active/inactive windows
style :clients do
  active    third.to_s, 2
  inactive  first.to_s, 2
  margin    0
  width     50
end

# Style for subtle
style :subtle do
  margin      0, 0, 0, 0
  panel       first.to_s
  #background  "#3d3d3d"
  stipple     second.to_s
end

#
# == Gravities
#
# Gravities are predefined sizes a window can be set to. There are several ways
# to set a certain gravity, most convenient is to define a gravity via a tag or
# change them during runtime via grab. Subtler and subtlext can also modify
# gravities.
#
# A gravity consists of four values which are a percentage value of the screen
# size. The first two values are x and y starting at the center of the screen
# and he last two values are the width and height.
#
# === Example
#
# Following defines a gravity for a window with 100% width and height:
#
#   gravity :example, [ 0, 0, 100, 100 ]
#
# === Link
#
# http://subforge.org/projects/subtle/wiki/Gravity
#

# Top left
gravity :top_left,       [   0,   0,  50,  50 ]
gravity :top_left66,     [   0,   0,  50,  66 ]
gravity :top_left33,     [   0,   0,  50,  33 ]

# Top
gravity :top,            [   0,   0, 100,  50 ]
gravity :top66,          [   0,   0, 100,  66 ]
gravity :top33,          [   0,   0, 100,  34 ]

# Top right
gravity :top_right,      [  50,   0,  50,  50 ]
gravity :top_right66,    [  50,   0,  50,  66 ]
gravity :top_right33,    [  50,   0,  50,  33 ]

# Left
gravity :left,           [   0,   0,  50, 100 ]
gravity :left66,         [   0,   0,  66, 100 ]
gravity :left33,         [   0,   0,  33, 100 ]

# Center
gravity :center,         [   0,   0, 100, 100 ]
gravity :center66,       [  17,  17,  66,  66 ]
gravity :center33,       [  33,  33,  33,  33 ]

# Right
gravity :right,          [  50,   0,  50, 100 ]
gravity :right66,        [  33,   0,  67, 100 ]
gravity :right33,        [  66,   0,  34, 100 ]

# Bottom left
gravity :bottom_left,    [   0,  50,  50,  50 ]
gravity :bottom_left66,  [   0,  33,  50,  67 ]
gravity :bottom_left33,  [   0,  66,  50,  34 ]

# Bottom
gravity :bottom,         [   0,  50, 100,  50 ]
gravity :bottom66,       [   0,  33, 100,  67 ]
gravity :bottom33,       [   0,  66, 100,  34 ]

# Bottom right
gravity :bottom_right,   [  50,  50,  50,  50 ]
gravity :bottom_right66, [  50,  33,  50,  67 ]
gravity :bottom_right33, [  50,  66,  50,  34 ]

# Gimp
gravity :gimp_image,     [  10,   0,  80, 100 ]
gravity :gimp_toolbox,   [   0,   0,  10, 100 ]
gravity :gimp_dock,      [  90,   0,  10, 100 ]

#
# == Grabs
#
# Grabs are keyboard and mouse actions within subtle, every grab can be
# assigned either to a key and/or to a mouse button combination. A grab
# consists of a chain and an action.
#
# === Finding keys
#
# The best resource for getting the correct key names is
# */usr/include/X11/keysymdef.h*, but to make life easier here are some hints
# about it:
#
# * Numbers and letters keep their names, so *a* is *a* and *0* is *0*
# * Keypad keys need *KP_* as prefix, so *KP_1* is *1* on the keypad
# * Strip the *XK_* from the key names if looked up in
#   /usr/include/X11/keysymdef.h
# * Keys usually have meaningful english names
# * Modifier keys have special meaning (Alt (A), Control (C), Meta (M),
#   Shift (S), Super (W))
#
# === Chaining
#
# Chains are a combination of keys and modifiers to one or a list of keys
# and can be used in various ways to trigger an action. In subtle, there are
# two ways to define chains for grabs:
#
#   1. *Default*: Add modifiers to a key and use it for a grab
#
#      *Example*: grab "W-Return", "urxvt"
#
#   2. *Chain*: Define a list of grabs that need to be pressed in order
#
#      *Example*: grab "C-y Return", "urxvt"
#
# ==== Mouse buttons
#
# [*B1*]  = Button1 (Left mouse button)
# [*B2*]  = Button2 (Middle mouse button)
# [*B3*]  = Button3 (Right mouse button)
# [*B4*]  = Button4 (Mouse wheel up)
# [*B5*]  = Button5 (Mouse wheel down)
# [*...*]
# [*B20*] = Button20 (Are you sure that this is a mouse and not a keyboard?)
#
# ==== Modifiers
#
# [*A*] = Alt key (Mod1)
# [*C*] = Control key
# [*M*] = Meta key (Mod3)
# [*S*] = Shift key
# [*W*] = Super/Windows key (Mod4)
# [*G*] = Alt Gr (Mod5)
#
# === Action
#
# An action is something that happens when a grab is activated, this can be one
# of the following:
#
# [*symbol*] Run a subtle action
# [*string*] Start a certain program
# [*array*]  Cycle through gravities
# [*lambda*] Run a Ruby proc
#
# === Example
#
# This will create a grab that starts a urxvt when Alt+Enter are pressed:
#
#   grab "A-Return", "urxvt"
#   grab "C-a c",    "urxvt"
#
# === Link
#
# http://subforge.org/projects/subtle/wiki/Grabs
#

# Jump to view1, view2, ...
grab "W-1", :ViewJump1
grab "W-2", :ViewJump2
grab "W-3", :ViewJump3
grab "W-4", :ViewJump4

# Switch current view
grab "W-S-1", :ViewSwitch1
grab "W-S-2", :ViewSwitch2
grab "W-S-3", :ViewSwitch3
grab "W-S-4", :ViewSwitch4

# Select next and prev view */
#grab "KP_Add",      :ViewNext
#grab "KP_Subtract", :ViewPrev

# Move mouse to screen1, screen2, ...
grab "W-A-1", :ScreenJump1
grab "W-A-2", :ScreenJump2
grab "W-A-3", :ScreenJump3
grab "W-A-4", :ScreenJump4

# Force reload of config and sublets
grab "W-C-r", :SubtleReload

# Force restart of subtle
grab "W-C-S-r", :SubtleRestart

# Quit subtle
grab "W-C-q", :SubtleQuit

# Move current window
grab "W-B1", :WindowMove

# Resize current window
grab "W-B3", :WindowResize

# Toggle floating mode of window
grab "W-f", :WindowFloat

# Toggle fullscreen mode of window
grab "W-space", :WindowFull

# Toggle sticky mode of window (will be visible on all views)
grab "W-v", :WindowStick

# Toggle zaphod mode of window (will span across all screens)
grab "W-equal", :WindowZaphod

# Raise window
grab "W-r", :WindowRaise

# Lower window
grab "W-l", :WindowLower

# Select next windows
grab "W-Left",  :WindowLeft
grab "W-Down",  :WindowDown

def goto_next_view(vArr)
  cindx = vArr.index(Subtlext::View.current);

  #Find the next view beyond all existing
  for i in 1..vArr.size do
    cV = vArr[(i + cindx) % vArr.size];

    # Verify that the potential next view isn't displayed on another screens
    if (Subtlext::View.visible.index(cV) == nil) then
      containsClients = false;
      # Check if the view has clients and if those clients are not only sticky one.
      cV.clients.each {|c|
        containsClients = !(cV.tags & c.tags).empty?;
        if(containsClients)
          break;
        end
      }

      if (containsClients) then
        cV.jump
        break
      end
    end
  end
end

grab "W-Right" do
  goto_next_view(Subtlext::View[:all]);
end

grab "W-Left" do
  goto_next_view(Subtlext::View[:all].reverse);
end

# Kill current window
grab "W-S-k", :WindowKill

# Cycle between given gravities
grab "W-KP_7", [ :top_left,     :top_left66,     :top_left33     ]
grab "W-KP_8", [ :top,          :top66,          :top33          ]
grab "W-KP_9", [ :top_right,    :top_right66,    :top_right33    ]
grab "W-KP_4", [ :left,         :left66,         :left33         ]
grab "W-KP_5", [ :center,       :center66,       :center33       ]
grab "W-KP_6", [ :right,        :right66,        :right33        ]
grab "W-KP_1", [ :bottom_left,  :bottom_left66,  :bottom_left33  ]
grab "W-KP_2", [ :bottom,       :bottom66,       :bottom33       ]
grab "W-KP_3", [ :bottom_right, :bottom_right66, :bottom_right33 ]

# In case no numpad is available e.g. on notebooks
grab "W-q", [ :top_left,     :top_left66,     :top_left33     ]
grab "W-w", [ :top,          :top66,          :top33          ]
grab "W-e", [ :top_right,    :top_right66,    :top_right33    ]
grab "W-a", [ :left,         :left66,         :left33         ]
grab "W-s", [ :center,       :center66,       :center33       ]
grab "W-d", [ :right,        :right66,        :right33        ]
#
# QUERTZ
#grab "W-y", [ :bottom_left,  :bottom_left66,  :bottom_left33  ]
#
# QWERTY
grab "W-z", [ :bottom_left,  :bottom_left66,  :bottom_left33  ]
#
grab "W-x", [ :bottom,       :bottom66,       :bottom33       ]
grab "W-c", [ :bottom_right, :bottom_right66, :bottom_right33 ]

# Meta
TERM = if File.exists? "/usr/bin/xterm" then "xterm"
       elsif File.exists? "/usr/bin/terminology" then "terminology"
       elsif File.exists? "/usr/bin/urxvt" then "urxvt"
       end

grab "XF86WebCam", "exec scrot"
grab "XF86Launch1", "firejail firefox"
grab "XF86KbdBrightnessUp", "exec asus-kbd-backlight up"
grab "XF86KbdBrightnessDown", "exec asus-kbd-backlight down"
grab "XF86AudioRaiseVolume", "ponymix increase 10 || amixer -c 0 set Master 10%+"
grab "C-F12", "ponymix increase 10 || amixer -c 0 set Master 10%+"
grab "XF86AudioLowerVolume", "ponymix decrease 10 || amixer -c 0 set Master 10%-"
grab "C-F11", "ponymix decrease 10 || amixer -c 0 set Master 10%-"
grab "XF86AudioMute", "ponymix toggle || amixer -c 0 set Master toggle"
grab "C-F10", "ponymix toggle || amixer -c 0 set Master toggle"
grab "XF86TouchpadToggle", "exec synclient TouchpadOff=$(synclient -l | grep -c 'TouchpadOff.*=.*0')"
grab "XF86Display", "exec xrandr --auto"
grab "XF86Launch6", "exec secure_run -m 0 -fn Inconsolata:style=Regular:size=18 -p 'dmenu>' -sf '#{first}' -sb '#{second}' -nf '#{fourth}' -nb '#{third}'"
grab "XF86MonBrightnessUp", "exec xbacklight -inc 5"
grab "XF86MonBrightnessDown", "exec xbacklight -dec 5"
grab "A-F2", "exec secure_run -m 0 -fn Inconsolata:style=Regular:size=18 -p 'dmenu>' -sf '#{first}' -sb '#{second}' -nf '#{fourth}' -nb '#{third}'"
grab "Menu", "exec secure_run -m 0 -fn Inconsolata:style=Regular:size=18 -p 'dmenu>' -sf '#{first}' -sb '#{second}' -nf '#{fourth}' -nb '#{third}'"
grab "W-Tab", "exec #{ENV['HOME']}/.config/subtle/sel.rb"
grab "W-P", "EDITOR='#{TERM} -e vim' #{ENV['HOME']}/.config/subtle/vitag.rb"
grab "C-A-L", "exec trollock"
grab "W-O", "exec #{TERM} -e ranger"

# Exec programs
grab "W-Return", "exec terminator"

grab "A-S-Tab" do
  Subtlext::View.current.clients.last.focus.raise
end

grab "A-Tab" do
  Subtlext::View.current.clients.first.lower.focus
end

# Run Ruby lambdas
grab "S-F2" do |c|
  puts c.name
end

grab "S-F3" do
  puts Subtlext::VERSION
end

#
# == Tags
#
# Tags are generally used in subtle for placement of windows. This placement is
# strict, that means that - aside from other tiling window managers - windows
# must have a matching tag to be on a certain view. This also includes that
# windows that are started on a certain view will not automatically be placed
# there.
#
# There are to ways to define a tag:
#
# === Simple
#
# The simple way just needs a name and a regular expression to just handle the
# placement:
#
# Example:
#
#  tag "terms", "terms"
#
# === Extended
#
# Additionally tags can do a lot more then just control the placement - they
# also have properties than can define and control some aspects of a window
# like the default gravity or the default screen per view.
#
# Example:
#
#  tag "terms" do
#    match   "xterm|[u]?rxvt"
#    gravity :center
#  end
#
# === Default
#
# Whenever a window has no tag it will get the default tag and be placed on the
#
# === Default
#
# Whenever a window has no tag it will get the default tag and be placed on the
# default view. The default view can either be set by the user with adding the
# default tag to a view by choice or otherwise the first defined view will be
# chosen automatically.
#
# === Properties
#
# [*borderless*] This property enables the borderless mode for tagged clients.
#
#                Example: borderless true
#                Links:    http://subforge.org/projects/subtle/wiki/Tagging#Borderless
#                          http://subforge.org/projects/subtle/wiki/Clients#Borderless
#
# [*fixed*]      This property enables the fixed mode for tagged clients.
#
#                Example: fixed true
#                Links:   http://subforge.org/projects/subtle/wiki/Tagging#Fixed
#                         http://subforge.org/projects/subtle/wiki/Clients#Fixed
#
# [*float*]      This property enables the float mode for tagged clients.
#
#                Example: float true
#                Links:   http://subforge.org/projects/subtle/wiki/Tagging#Float
#                         http://subforge.org/projects/subtle/wiki/Clients#Float
#
# [*full*]       This property enables the fullscreen mode for tagged clients.
#
#                Example: full true
#                Links:   http://subforge.org/projects/subtle/wiki/Tagging#Fullscreen
#                         http://subforge.org/projects/subtle/wiki/Clients#Fullscreen
#
# [*geometry*]   This property sets a certain geometry as well as floating mode
#                to the tagged client, but only on views that have this tag too.
#                It expects an array with x, y, width and height values whereas
#                width and height must be >0.
#
#                Example: geometry [100, 100, 50, 50]
#                Link:    http://subforge.org/projects/subtle/wiki/Tagging#Geometry
#
# [*gravity*]    This property sets a certain to gravity to the tagged client,
#                but only on views that have this tag too.
#
#                Example: gravity :center
#                Link:    http://subforge.org/projects/subtle/wiki/Tagging#Gravity
#
# [*match*]      This property adds matching patterns to a tag, a tag can have
#                more than one. Matching works either via plaintext, regex
#                (see man regex(7)) or window id. Per default tags will only
#                match the WM_NAME and the WM_CLASS portion of a client, this
#                can be changed with following possible values:
#
#                [*:name*]      Match the WM_NAME
#                [*:instance*]  Match the first (instance) part from WM_CLASS
#                [*:class*]     Match the second (class) part from WM_CLASS
#                [*:role*]      Match the window role
#                [*:type*]      Match the window type
#
#                Examples: match instance: "urxvt"
#                          match [:role, :class] => "test"
#                          match "[xa]+term"
#                Link:     http://subforge.org/projects/subtle/wiki/Tagging#Match
#
# [*position*]   Similar to the geometry property, this property just sets the
#                x/y coordinates of the tagged client, but only on views that
#                have this tag, too. It expects an array with x and y values.
#
#                Example: position [ 10, 10 ]
#                Link:    http://subforge.org/projects/subtle/wiki/Tagging#Position
#
# [*resize*]     This property enables the float mode for tagged clients. When set,
#                subtle honors size hints, that define various size constraints like
#                sizes for columns and rows of a terminal.
#
#                Example: resize true
#                Links:   http://subforge.org/projects/subtle/wiki/Tagging#Resize
#                         http://subforge.org/projects/subtle/wiki/Clients#Resize
#
# [*stick*]      This property enables the stick mode for tagged clients. When set,
#                clients are visible on all views, even when they don't have matching
#                tags. On multihead, sticky clients keep the screen they are assigned
#                on.
#
#                Supported values are either true or a number to specify a screen.
#
#                Example: stick true
#                         stick 1
#                Links:   http://subforge.org/projects/subtle/wiki/Tagging#Stick
#                         http://subforge.org/projects/subtle/wiki/Clients#Stick
#
# [*type*]       This property sets the tagged client to be treated as a specific
#                window type though as the window sets the type itself. Following
#                types are possible:
#
#                [*:desktop*]  Treat as desktop window (_NET_WM_WINDOW_TYPE_DESKTOP)
#                              Link: http://subforge.org/projects/subtle/wiki/Clients#Desktop
#                [*:dock*]     Treat as dock window (_NET_WM_WINDOW_TYPE_DOCK)
#                              Link: http://subforge.org/projects/subtle/wiki/Clients#Dock
#                [*:toolbar*]  Treat as toolbar windows (_NET_WM_WINDOW_TYPE_TOOLBAR)
#                              Link: http://subforge.org/projects/subtle/wiki/Clients#Toolbar
#                [*:splash*]   Treat as splash window (_NET_WM_WINDOW_TYPE_SPLASH)
#                              Link: http://subforge.org/projects/subtle/wiki/Clients#Splash
#                [*:dialog*]   Treat as dialog window (_NET_WM_WINDOW_TYPE_DIALOG)
#                              Link: http://subforge.org/projects/subtle/wiki/Clients#Dialog
#
#                Example: type :desktop
#                Link:    http://subforge.org/projects/subtle/wiki/Tagging#Type
#
# [*urgent*]     This property enables the urgent mode for tagged clients. When set,
#                subtle automatically sets this client to urgent.
#
#                Example: urgent true
#                Links:   http://subforge.org/projects/subtle/wiki/Tagging#Stick
#                         http://subforge.org/projects/subtle/wiki/Clients#Urgent
#
# [*zaphod*]     This property enables the zaphod mode for tagged clients. When set,
#                the client spans across all connected screens.
#
#                Example: zaphod true
#                Links:   http://subforge.org/projects/subtle/wiki/Tagging#Zaphod
#                         http://subforge.org/projects/subtle/wiki/Clients#Zaphod
#
#
# === Link
#
# http://subforge.org/projects/subtle/wiki/Tagging
#

# Simple tags
tag "terms",   "xterm|[u]?rxvt|terminology"
tag "browser", "uzbl|opera|firefox|navigator|vimb|chrom(e|ium)"

# Placement
tag "editor" do
  match  "^[g]?vim|atom|lyx$"
  resize true
end

tag "document", "zathura|okular|CuteMarkEd|Xournal|Foxit|Libreoffice"

tag "wine" do
  match instance: "exe$"
  type :dialog
end

tag "media", "vlc|mpv|mplayer|pavucontrol|clementine|Spotify"

tag "steam" do
  match "[Ss]team"
end

tag "fixed" do
  geometry [ 10, 10, 100, 100 ]
  stick    true
end

tag "resize" do
  match  "sakura|gvim"
  resize true
end

tag "gravity" do
  gravity :center
end

tag "float" do
  match "display"
  float true
end

# Gimp
tag "gimp_image" do
  match   :role => "gimp-image-window"
  gravity :gimp_image
end

tag "gimp_toolbox" do
  match   :role => "gimp-toolbox$"
  gravity :gimp_toolbox
end

tag "gimp_dock" do
  match   :role => "gimp-dock"
  gravity :gimp_dock
end

tag "gimp_scum" do
  match role: "gimp-.*|screenshot"
end

tag "notes", "org-knopflerfish-framework-BundleThread"

tag "virtualmachine" do
  match   "virtualbox|qemu"
  gravity :center
  sticky false
  float false
end

tag "ide", "Vivado.*|win0"

#
# == Views
#
# Views are the virtual desktops in subtle, they show all windows that share a
# tag with them. Windows that have no tag will be visible on the default view
# which is the view with the default tag or the first defined view when this
# tag isn't set.
#
# Like tags views can be defined in two ways:
#
# === Simple
#
# The simple way is exactly the same as for tags:
#
# Example:
#
#   view "terms", "terms"
#
# === Extended
#
# The extended way for views is also similar to the tags, but with fewer
# properties.
#
# Example:
#
#  view "terms" do
#    match "terms"
#    icon  "/usr/share/icons/icon.xbm"
#  end
#
# === Properties
#
# [*match*]      This property adds a matching pattern to a view. Matching
#                works either via plaintext or regex (see man regex(7)) and
#                applies to names of tags.
#
#                Example: match "terms"
#
# [*dynamic*]    This property hides unoccupied views, views that display no
#                windows.
#
#                Example: dynamic true
#
# [*icon*]       This property adds an icon in front of the view name. The
#                icon can either be path to an icon or an instance of
#                Subtlext::Icon.
#
#                Example: icon "/usr/share/icons/icon.xbm"
#                         icon Subtlext::Icon.new("/usr/share/icons/icon.xbm")
#
# [*icon_only*]  This property hides the view name from the view buttons, just
#                the icon will be visible.
#
#                Example: icon_only true
#
#
# === Link
#
# http://subforge.org/projects/subtle/wiki/Tagging
#

view "terms" do
  match "terms|default"
 dynamic true
end
view "www" do
  match "browser"
  dynamic true
end
view "docs" do
  match "document"
  dynamic true
end
view "dev" do
  match "editor|ide"
  dynamic true
end
view "vm" do
  match "virtualmachine"
  dynamic true
end
view "media" do
  match "media"
  dynamic true
end
view "games" do
  match "steam"
  dynamic true
end
view "notes" do
  match "editor|note"
  dynamic true
end
view "gimp" do
  match"gimp_.*"
  dynamic true
end

#
# == Sublets
#
# Sublets are Ruby scripts that provide data for the panel and can be managed
# with the sur script that comes with subtle.
#
# === Example
#
#  sur install clock
#  sur uninstall clock
#  sur list
#
# === Configuration
#
# All sublets have a set of configuration values that can be changed directly
# from the config of subtle.
#
# There are three default properties, that can be be changed for every sublet:
#
# [*interval*]    Update interval of the sublet
# [*foreground*]  Default foreground color
# [*background*]  Default background color
#
# sur can also give a brief overview about properties:
#
# === Example
#
#   sur config clock
#
# The syntax of the sublet configuration is similar to other configuration
# options in subtle:
#
# === Example
#
#  sublet :clock do
#    interval      30
#    foreground    "#eeeeee"
#    background    "#000000"
#    format_string "%H:%M:%S"
#  end
#
#  === Link
#
# http://subforge.org/projects/subtle/wiki/Sublets
#

#
# == Hooks
#
# And finally hooks are a way to bind Ruby scripts to a certain event.
#
# Following hooks exist so far:
#
# [*:client_create*]    Called whenever a window is created
# [*:client_configure*] Called whenever a window is configured
# [*:client_focus*]     Called whenever a window gets focus
# [*:client_kill*]      Called whenever a window is killed
#
# [*:view_configure*]   Called whenever a view is configured
# [*:view_jump*]        Called whenever the view is switched
# [*:view_kill*]        Called whenever a view is killed
#
# [*:tile*]             Called on whenever tiling would be needed
# [*:reload*]           Called on reload
# [*:start*]            Called on start
# [*:exit*]             Called on exit
#
# === Example
#
# This hook will print the name of the window that gets the focus:
#
#   on :client_focus do |c|
#     puts c.name
#   end
#
# === Link
#
# http://subforge.org/projects/subtle/wiki/Hooks
#

on :view_jump do |v|
  v.clients.first.raise.focus
end

on :client_create do |c|
  c.raise.focus
end

on :start do
  # Create missing tags
  views = Subtlext::View.all.map { |v| v.name }
  tags  = Subtlext::Tag.all.map { |t| t.name }

  views.each do |v|
    unless tags.include?(v)
      t = Subtlext::Tag.new(v)
      t.save
    end
  end
end

# Add nine C-S-< number> grabs
(1..9).each do |i|
  grab "C-S-%d" % [ i ] do |c|
    views = Subtlext::View.all
    names = views.map { |v| v.name }

    # Sanity check
    if i <= views.size
      # Tag client
      tags = c.tags.reject { |t| names.include?(t.name) or "default" == t.name }
      tags << names[i - 1]

      c.tags = tags

      # Tag view
      views[i - 1].tag(names[i - 1])
    end
  end
end

# Assign tags to clients
on :client_create do |c|
  view = Subtlext::View.current
  tags = c.tags.map { |t| t.name }

  # Add tag to view
  view.tag(view.name) unless(view.tags.include?(view.name))

  # Exclusive for clients with default tag only
  if tags.include?("default") and 1 == tags.size
    c.tags = [ view.name ]
  end
end

# vim:ts=2:bs=2:sw=2:et:fdm=marker
