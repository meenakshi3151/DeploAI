const { Julep } = require("@julep/sdk");
const yaml = require("yaml");
const fs = require("fs");
const path = require("path");

const client = new Julep({
  apiKey: process.env.JULEP_API_KEY,
  environment: process.env.JULEP_ENVIRONMENT || "production",
});

async function fixSourceCodeWithAI(logs, repoPath) {
  const agent = await client.agents.create({
    name: "Source Code Debugger",
    model: "claude-3.5-sonnet",
    about: "Fixes source code bugs based on container logs",
  });

  const taskDefinition = `
name: Code Fixer
description: Fix source code issues based on runtime logs
main:
  - prompt:
      - role: system
        content: You are a senior full-stack engineer. Fix the runtime errors in the given source code.
      - role: user
        content: |-
          $ f"""
          Runtime Logs:
          ---
          {steps[0].input.logs}

          File Tree:
          ---
          {steps[0].input.structure}

          For each file that needs editing, return the file path and the full corrected content. Output as a JSON array like:
          [
            { "path": "src/App.js", "content": "<fixed code>" },
            ...
          ]
          """
`;

  const structure = await getFileStructure(repoPath);

  const task = await client.tasks.create(agent.id, yaml.parse(taskDefinition));
  const execution = await client.executions.create(task.id, {
    input: { logs, structure },
  });

  let result;
  while (true) {
    result = await client.executions.get(execution.id);
    if (result.status === "succeeded" || result.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (result.status !== "succeeded") throw new Error("AI code fix failed.");

  const fixes = JSON.parse(result.output.choices[0].message.content);
  for (const fix of fixes) {
    const filePath = path.join(repoPath, fix.path);
    fs.writeFileSync(filePath, fix.content, "utf-8");
  }

  return fixes;
}

// helper to get file structure
async function getFileStructure(dir, base = dir) {
  let structure = "";
  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(base, fullPath);
    const stat = await fs.promises.stat(fullPath);
    if (stat.isDirectory()) {
      structure += `${relPath}/\n`;
      structure += await getFileStructure(fullPath, base);
    } else {
      structure += `${relPath}\n`;
    }
  }
  return structure;
}

module.exports = { fixSourceCodeWithAI };
