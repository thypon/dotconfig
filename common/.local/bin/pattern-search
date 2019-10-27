#!/usr/bin/env ruby
filenames = Dir[ARGV[0]].reject { |f| File.directory? f }

ARGV.shift

filenames.each do |fname|
	File.open(fname, "r") do |f|
		matches = 0
		f.each_line do |line|
	    	if line.include? ARGV[matches]
	    		matches += 1
	    	end
	    	if matches == ARGV.count
	    		break
	    	end
		end
	  	if matches == ARGV.count
			puts fname
	  	end
	end
end