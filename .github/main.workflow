workflow "Build and Audit" {
  on = "push"
  resolves = ["Publish"]
}

action "Build" {
  uses = "actions/npm@e7aaefed7c9f2e83d493ff810f17fa5ccd7ed437"
  args = "ci"
}

action "Audit" {
  uses = "actions/npm@e7aaefed7c9f2e83d493ff810f17fa5ccd7ed437"
  args = "audit"
  needs = ["Build"]
}

action "Tag" {
  uses = "actions/bin/filter@9d4ef995a71b0771f438dd7438851858f4a55d0c"
  needs = ["Audit"]
  args = "tag"
}

action "Publish" {
  uses = "actions/npm@3c8332795d5443adc712d30fa147db61fd520b5a"
  needs = ["Tag"]
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}
