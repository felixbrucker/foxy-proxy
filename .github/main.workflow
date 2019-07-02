workflow "Build, Audit and Publish" {
  on = "push"
  resolves = [
    "Audit dependencies",
    "Build Web UI",
    "Post to Discord",
  ]
}

action "Install dependencies" {
  uses = "actions/npm@e7aaefed7c9f2e83d493ff810f17fa5ccd7ed437"
  args = "ci"
}

action "Audit dependencies" {
  uses = "actions/npm@e7aaefed7c9f2e83d493ff810f17fa5ccd7ed437"
  args = "audit"
  needs = ["Install dependencies"]
}

action "Tag" {
  uses = "actions/bin/filter@9d4ef995a71b0771f438dd7438851858f4a55d0c"
  needs = [
    "Audit dependencies",
    "Build Web UI",
  ]
  args = "tag"
}

action "Publish to npm" {
  uses = "actions/npm@3c8332795d5443adc712d30fa147db61fd520b5a"
  needs = ["Tag"]
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}

action "Build Web UI" {
  uses = "actions/npm@4633da3702a5366129dca9d8cc3191476fc3433c"
  args = "run build-web"
  needs = ["Install Web UI dependencies"]
}

action "Install Web UI dependencies" {
  uses = "actions/npm@4633da3702a5366129dca9d8cc3191476fc3433c"
  args = "run install-web"
}

action "Create Github Release" {
  uses = "felixbrucker/github-actions/publish-release@master"
  needs = ["Publish to npm"]
  secrets = ["GITHUB_TOKEN"]
  args = ["--name", "Foxy-Proxy"]
}

action "Post to Discord" {
  uses = "felixbrucker/github-actions/post-release-in-discord@master"
  needs = ["Create Github Release"]
  secrets = ["FOXY_DISCORD_WEBHOOK_ID", "FOXY_DISCORD_WEBHOOK_TOKEN"]
}
