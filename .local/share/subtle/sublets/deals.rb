# When sublet file
# Created with sur-0.2
# Put:
#  @hourly when --past=0 --future=0 --language=en --no-header --nowrap_auto --nopaging --norows_auto --nostyled_output > .events
# inside a cronjob
require 'json'

configure :when do |s|
  s.interval = 60
end

on :mouse_down do |s, x, y, button|
  `daemonize /usr/bin/chromium #{s.deal['href']}`
end

on :run do |s|
  s.deal = JSON.parse(File.read("#{ENV['HOME']}/.deals"))
  s.data = "#{s.deal['name']}, #{s.deal['price']}"
end
