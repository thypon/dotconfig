#!/usr/bin/env ruby

puts "<?xml version=\"1.0\" encoding=\"UTF-8\"?>"
puts "<manifest>"
File.readlines(ARGV[0]).each do |line|
	row = line.split(',').map(&:strip)
  dir = row[0].to_s
  project = dir.gsub(ARGV[1], '')
  branch_a = row[1]
  branch_b = row[2]
  target_b = row[3]
  diffs = row[4]

  if diffs == "0"
  	puts "\t<remove-project name=\"platform_#{project.gsub('/', '_')}\" />"
  	if branch_b == target_b
  		puts "\t<project name=\"platform/#{project}\" path=\"#{project}\" remote=\"aosp\" />"
  	else
  		puts "\t<project name=\"platform/#{project}\" path=\"#{project}\" remote=\"aosp\" revision=\"#{target_b}\" />"
  	end
  end
end
puts "</manifest>"