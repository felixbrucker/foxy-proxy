workflow "Build, Audit and Publish" {
  on = "push"
  resolves = [
    "Publish",
    "Audit Web UI",
  ]
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
  needs = [
    "Audit",
    "Audit Web UI",
  ]
  args = "tag"
}

action "Publish" {
  uses = "actions/npm@3c8332795d5443adc712d30fa147db61fd520b5a"
  needs = ["Tag"]
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}

action "Build Web UI" {
  uses = "actions/npm@4633da3702a5366129dca9d8cc3191476fc3433c"
  args = "run build"
}

action "Audit Web UI" {
  uses = "actions/npm@4633da3702a5366129dca9d8cc3191476fc3433c"
  needs = ["Build Web UI"]
  args = "run audit-web"
}
