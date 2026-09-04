Feature: Merge operator with null-deletion semantics
  As the SKILL.state runtime
  I need a deterministic dictionary merge
  So that state transitions are validated and bounded

  Scenario: Null value deletes a nested key
    Given execution state:
      """json
      {"inventory":{"shelf_42":"item_12","shelf_9":"item_3"}}
      """
    When a patch is merged:
      """json
      {"inventory":{"shelf_42":null}}
      """
    Then the merge is accepted
    And the state is:
      """json
      {"inventory":{"shelf_9":"item_3"}}
      """

  Scenario: Keys omitted from the patch are preserved
    Given execution state:
      """json
      {"flags":[],"cwd":"/tmp"}
      """
    When a patch is merged:
      """json
      {"cwd":"/opt"}
      """
    Then the merge is accepted
    And the state is:
      """json
      {"flags":[],"cwd":"/opt"}
      """

  Scenario: Arrays replace wholesale
    Given execution state:
      """json
      {"hypotheses":["a","b"]}
      """
    When a patch is merged:
      """json
      {"hypotheses":["c"]}
      """
    Then the merge is accepted
    And the state is:
      """json
      {"hypotheses":["c"]}
      """

  Scenario: Deep merge on nested objects
    Given execution state:
      """json
      {"a":{"b":{"c":1}}}
      """
    When a patch is merged:
      """json
      {"a":{"b":{"d":2}}}
      """
    Then the merge is accepted
    And the state is:
      """json
      {"a":{"b":{"c":1,"d":2}}}
      """

  Scenario: Non-object patch is rejected and state unchanged
    Given execution state:
      """json
      {"x":1}
      """
    When a scalar patch "nope" is merged
    Then the merge is rejected
    And the state is:
      """json
      {"x":1}
      """

  Scenario: Prototype pollution keys are rejected
    Given execution state:
      """json
      {"x":1}
      """
    When a patch is merged:
      """json
      {"__proto__":{"y":2}}
      """
    Then the merge is rejected
    And the state is:
      """json
      {"x":1}
      """

  Scenario: Oversized resulting state is rejected
    Given execution state:
      """json
      {}
      """
    When a patch with a 70000 byte string value is merged
    Then the merge is rejected
    And the state is:
      """json
      {}
      """
