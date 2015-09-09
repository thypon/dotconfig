# When sublet file
# Created with sur-0.2
configure :when do |s|
  s.interval = 300
end

on :run do |s|
  s.data = `when --past=0 --future=0 --language=en --no-header --nowrap_auto --nopaging --norows_auto --nostyled_output`.split("\n").map do |elem|
    elem.match(/[^\s]+\s+\d+\s+[^\s]+\s+\d+\s+(.*)/)[1]
  end.select { |e| ! e.index '!'}.first(4).join(", ")
end
