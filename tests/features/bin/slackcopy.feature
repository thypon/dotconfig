Feature: slackcopy
  Convert GitHub markdown to Slack formatting and copy to the clipboard:
  rich HTML flavor (what Slack renders on paste) plus plain mrkdwn.

  Scenario: Copies markdown as rich HTML plus mrkdwn to the clipboard
    Given osascript is available
    When slackcopy runs with "# Title\n\nsome **bold** and _italic_ text"
    Then the osascript script sets a plain flavor containing "*Title*\n\nsome *bold* and _italic_ text"
    And the osascript script sets an HTML flavor containing "<b>Title</b>" and "<strong>bold</strong>"
    And the output confirms the copy

  Scenario: Converts links, lists and code to Slack entities
    Given osascript is available
    When slackcopy runs with "- [Brave](https://brave.com)\n1. ~~strike~~\n\n> quoted\n\n    npm test"
    Then the osascript script sets a plain flavor containing "• <https://brave.com|Brave>\n1. ~strike~\n\n> quoted\n\n```\nnpm test\n```"
    And the osascript script sets an HTML flavor containing "<a href=" and "Brave</a>" and "<del>strike</del>" and "<pre><code>npm test"

  Scenario: Converts piped stdin
    Given osascript is available
    And stdin is a pipe containing "plain **b**"
    When slackcopy runs with no arguments
    Then the osascript script sets a plain flavor containing "plain *b*"
    And the output confirms the copy

  Scenario: Converts a file argument
    Given osascript is available
    And a file "note.md" containing "# Note"
    When slackcopy runs with the file "note.md"
    Then the osascript script sets a plain flavor containing "*Note*"

  Scenario: Multiple file arguments are concatenated
    Given osascript is available
    And a file "a.md" containing "**one**"
    And a file "b.md" containing "**two**"
    When slackcopy runs with the files "a.md" "b.md"
    Then the osascript script sets a plain flavor containing "*one*\n\n*two*"

  Scenario: Converts tables to a numbered list
    Given osascript is available
    When slackcopy runs with "| a | b |\n| --- | --- |\n| 1 | 2 |"
    Then the osascript script carries the table as a numbered list in both flavors

  Scenario: Converts a horizontal rule to a dash line
    Given osascript is available
    When slackcopy runs with "above\n\n---\n\nbelow"
    Then the osascript script sets a plain flavor containing "above\n\n———————————\n\nbelow"

  Scenario: Does not set the clipboard in stdout mode
    Given osascript is available
    When slackcopy runs with "# H" and --stdout
    Then the output is exactly "*H*\n"
    And osascript is not called

  Scenario: Copies only mrkdwn via pbcopy in plain mode
    Given pbcopy is available
    When slackcopy runs with "pre **X**" and --plain
    Then pbcopy receives "pre *X*"

  Scenario: Fails when pbcopy is not installed in plain mode
    Given pbcopy is not on PATH
    When slackcopy runs with "hello" and --plain
    Then the script exits 1
    And the output tells the user to install pbcopy

  Scenario: Fails when osascript cannot be run
    Given osascript is not on PATH
    When slackcopy runs with "hello"
    Then the script exits 1
    And the output mentions the rich clipboard failure

  Scenario: Empty input prints usage
    Given osascript is available
    When slackcopy runs with no arguments and no stdin
    Then the output shows the usage lines
    And the script exits 0