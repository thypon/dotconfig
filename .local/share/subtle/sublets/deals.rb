# When sublet file
# Created with sur-0.2
require 'json'

configure :when do |s|
  s.interval = 60
end

on :mouse_down do |s, x, y, button|
  `daemonize /usr/bin/chromium #{s.deal['href']}`
end

on :run do |s|
  s.deal = JSON.parse(File.read("/tmp/.deals"))
  s.data = "#{s.deal['name']}, #{s.deal['price']}"
end
