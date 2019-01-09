workflow "Pipeline" {
  on = "push"
  resolves = ["Build"]
}

action "Build" {
  uses = "actions/npm@e7aaefed7c9f2e83d493ff810f17fa5ccd7ed437"
  args = "install"
}
