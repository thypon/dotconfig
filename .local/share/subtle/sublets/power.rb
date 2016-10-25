# When sublet file
# Created with sur-0.2

configure :power do |s|
  if File.exists? '/sys/class/power_supply/BAT0/power_now'
    s.interval = 10
  else
    s.interval = 600
  end
end

on :run do |s|
  begin
    s.data = "#{File.read('/sys/class/power_supply/BAT0/power_now').to_f / 1000000}W"
  rescue e => Exception
    # do nothing
  end
end
