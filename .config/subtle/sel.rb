#!/usr/bin/env ruby
require 'singleton'

begin
  require 'subtle/subtlext'
rescue LoadError
  puts ">>> ERROR: Couldn't find subtlext"
  exit
end

begin
  require 'dmenu'
rescue LoadError
  puts ">>> ERROR: Couldn't find dmenu"
  exit
end

class Dmenu
  def setup(arg)
    self.font = "Inconsolata:style=Regular:size=18"
    self.selected_foreground = "darkgreen"
    self.selected_background = "gray"
    self.prompt = arg + ">"
    self.lines = 25
    self.case_insensitive = true
  end
end

d = Dmenu.new
d.setup "apps"
d.items = Subtlext::View.current.clients.map(&:name).map(&:strip).uniq.sort
r = d.run
if r != nil
  v = r.value
  Subtlext::View.current.clients.select { |e| e.name.include? v }.first.raise.focus
end
