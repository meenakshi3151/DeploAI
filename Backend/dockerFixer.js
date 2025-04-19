const { Julep } = require("@julep/sdk");
const yaml = require("yaml");

const client = new Julep({
  apiKey: process.env.JULEP_API_KEY,
  environment: process.env.JULEP_ENVIRONMENT || "production",
});

async function fixDockerErrorWithAI(dockerfile, logs) {
  const agent = await client.agents.create({
    name: "Dockerfile Debugger",
    model: "claude-3.5-sonnet",
    about: "Fixes Dockerfile issues using error logs",
  });

  const taskDefinition = `
name: Dockerfile Fixer
description: Fixes Dockerfile errors using logs
main:
  - prompt:
      - role: system
        content: You are a DevOps expert. You debug and fix Dockerfiles using container logs.
      - role: user
        content: |-
          $ f"""
          Here's the current Dockerfile:
          ---
          {steps[0].input.dockerfile}

          And here is the error log:
          ---
          {steps[0].input.logs}

          Please return only the corrected Dockerfile.
          """
`;

  const task = await client.tasks.create(agent.id, yaml.parse(taskDefinition));

  const execution = await client.executions.create(task.id, {
    input: { dockerfile, logs },
  });

  let result;
  while (true) {
    result = await client.executions.get(execution.id);
    if (result.status === "succeeded" || result.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (result.status === "succeeded") {
    return result.output.choices[0].message.content;
  } else {
    throw new Error("Failed to fix Dockerfile with AI.");
  }
}

module.exports = { fixDockerErrorWithAI };
