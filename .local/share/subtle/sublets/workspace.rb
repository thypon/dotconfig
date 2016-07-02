# When sublet file
# Created with sur-0.2
configure :workspace do |s|
  s.interval = 10
end

on :run do |s|
  s.data = File.readlines('/tmp/.workspace').first.
	  strip[3..-1].gsub(ENV["HOME"], '~')
end
