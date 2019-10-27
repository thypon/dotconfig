# When sublet file
# Created with sur-0.2

configure :power do |s|
  if File.exists? '/var/log/wpa.log'
    s.interval = 10
  else
    s.interval = 600
  end
end

on :run do |s|
  begin
    require 'csv'
    c = CSV.read('/var/log/wpa.log', headers: true, header_converters: :symbol)
    # get last element
    last = c.lazy.drop(c.size - 1).first
    hours = (((((Time.now - Time.at(last[:epoch].to_i)) / (60 * 60)) * 2).ceil + 0.0) / 2).to_s
    s.data = "#{last[:ssid]} #{last[:event].downcase} #{hours}"
  rescue e => Exception
    # do nothing
  end
end
