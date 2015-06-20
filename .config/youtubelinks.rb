#!/usr/bin/env ruby
puts File.read(ARGV[0]).scan(/(?:https?:\/\/)?(?:www\.)?youtu(?:\.be|be\.com)\/(?:watch\?v=)?([\w-]{10,})/).map { |e| e[0] }.join(" ")
