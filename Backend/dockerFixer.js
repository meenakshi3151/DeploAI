const { Julep } = require("@julep/sdk");
const yaml = require("yaml");
const fs = require("fs");
const path = require("path");

const client = new Julep({
  apiKey: process.env.JULEP_API_KEY,
  environment: process.env.JULEP_ENVIRONMENT || "production",
});

async function fixSourceCodeWithAI(logs, repoPath) {
  // Step 1: Create the agent
  console.log("Entry");
  console.log("logs", logs);
  console.log(repoPath);
  const agent = await client.agents.create({
    name: "Source Code Debugger",
    model: "claude-3.5-sonnet",
    about: "Fixes source code bugs based on container logs",
  });
  console.log(agent);
  // Step 2: Create the task
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
          {_.logs}

          File Tree:
          ---
          {_.structure}

          Instructions:
          - Identify the root cause of the error using the logs.
          - If a variable or function is undefined, check the file structure to determine where it should be imported from.
          - For each file that needs to be edited, return an object with its relative path and the full corrected content.

          Output Format:
          Respond ONLY with valid JSON.
          Escape all newlines in the content string using \\\\n.
          Wrap your response like this:

          ~~~json
          [
            {{
              "path": "src/App.js",
              "content": "line 1\\\\nline 2\\\\n// etc"
            }}
          ]
          ~~~
          """
`;

  const task = await client.tasks.create(agent.id, yaml.parse(taskDefinition));
  console.log("task", task);
  // Step 3: Build file tree
  const structure = await getFileStructure(repoPath);
  console.log("structure" + structure);
  // Step 4: Execute the fix task
  const execution = await client.executions.create(task.id, {
    input: { logs, structure },
  });
  console.log("execution" + execution.id);
  let result;
  while (true) {
    result = await client.executions.get(execution.id);
    console.log("result", result);
    if (result.status === "succeeded" || result.status === "failed") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("Breaked");
  if (result.status !== "succeeded") {
    console.error("❌ Execution failed:", JSON.stringify(result, null, 2));
    throw new Error("AI code fix failed.");
  }
  console.log("1  ", result.output.choices[0]);
  console.log("2  ", result.output.choices[0].message);
  console.log("3  ", result.output.choices[0].message.content);

  // Extract JSON between the ~~~json or ```json block
  const rawContent = result.output.choices?.[0]?.message?.content;

  if (!rawContent) {
    console.error(
      "❌ No content found in result.output.choices[0].message.content"
    );
    throw new Error("Missing content in AI output.");
  }

  console.log("📦 Raw AI Output:\n", rawContent);

  // Try to extract JSON from code block
  const jsonMatch = rawContent.match(
    /(?:~~~|```)(?:json)?\s*([\s\S]*?)\s*(?:~~~|```)/
  );

  if (!jsonMatch) {
    console.error("❌ Could not extract JSON block from AI output.");
    throw new Error("Failed to parse code block from AI output.");
  }

  let fixes;
  try {
    fixes = JSON.parse(jsonMatch[1]);
    console.log("✅ Parsed Fixes:\n", fixes);
  } catch (err) {
    console.error("❌ JSON parse error:", err);
    console.error("🪵 JSON candidate:\n", jsonMatch[1]);
    throw new Error("Failed to parse fixes JSON.");
  }

  // Step 5: Apply file patches
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
