workflow "Build, Audit and Publish" {
  on = "push"
  resolves = [
    "Audit dependencies",
    "Build Web UI",
    "Post to Discord",
  ]
}

action "Install dependencies" {
  uses = "actions/npm@master"
  args = "ci"
}

action "Audit dependencies" {
  uses = "actions/npm@master"
  args = "audit"
  needs = ["Install dependencies"]
}

action "Tag" {
  uses = "actions/bin/filter@master"
  needs = [
    "Audit dependencies",
    "Build Web UI",
  ]
  args = "tag"
}

action "Publish to npm" {
  uses = "actions/npm@master"
  needs = ["Tag"]
  args = "publish --access public"
  secrets = ["NPM_AUTH_TOKEN"]
}

action "Build Web UI" {
  uses = "actions/npm@master"
  args = "run build-web"
  needs = ["Install Web UI dependencies"]
}

action "Install Web UI dependencies" {
  uses = "actions/npm@master"
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
