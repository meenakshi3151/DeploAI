const dotenv = require("dotenv");
const { Julep } = require("@julep/sdk");
const yaml = require("yaml");
const fs = require("fs");
const path = require("path");
const { promisify } = require("util");
const simpleGit = require("simple-git");

dotenv.config();

const client = new Julep({
  apiKey: process.env.JULEP_API_KEY,
  environment: process.env.JULEP_ENVIRONMENT || "production",
});

const readFileAsync = promisify(fs.readFile);

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

async function cloneRepo(githubUrl) {
  const repoName = githubUrl.split("/").pop()?.replace(".git", "") || "repo";
  const clonePath = path.join("/tmp", `repo-${Date.now()}`);
  await simpleGit().clone(githubUrl, clonePath);
  return { repoName, clonePath };
}

async function createAgentIfNeeded() {
  const agent = await client.agents.create({
    name: "Dockerfile Generator",
    model: "claude-3.5-sonnet",
    about:
      "Generates Dockerfiles based on source code structure and package.json.",
  });

  const taskDefinition = `
name: Dockerfile Generator
description: Generate a Dockerfile based on repo structure
main:
  - prompt:
      - role: system
        content: You are a devops engineer who writes Dockerfiles.
      - role: user
        content: |-
          $ f"""
          Write a valid Dockerfile for the following project.
          Do not include any explanation or markdown — just output the raw Dockerfile content.

          FILE_STRUCTURE:
          {steps[0].input.structure}

          PACKAGE_JSON:
          {steps[0].input.package}
          """
`;

  const task = await client.tasks.create(agent.id, yaml.parse(taskDefinition));
  return { agentId: agent.id, taskId: task.id };
}

async function generateDockerfileFromRepo(repoUrl) {
  let clonePath;
  try {
    const { agentId, taskId } = await createAgentIfNeeded();
    const cloneResult = await cloneRepo(repoUrl);
    clonePath = cloneResult.clonePath;

    const structure = await getFileStructure(clonePath);
    const packagePath = path.join(clonePath, "package.json");

    let packageJson = "{}";
    try {
      const pkgContent = await readFileAsync(packagePath, "utf-8");
      packageJson = pkgContent;
    } catch {
      console.warn("No package.json found, using empty object.");
    }

    const execution = await client.executions.create(taskId, {
      input: {
        structure: structure,
        package: packageJson,
      },
    });
    console.log("Waiting for execution to complete:", execution.id);

    let result;
    while (true) {
      result = await client.executions.get(execution.id);
      console.log("Execution status:", result.status);
      if (result.status === "succeeded" || result.status === "failed") break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (result.status === "succeeded") {
      if (result.output?.choices?.[0]?.message?.content) {
        return result.output.choices[0].message.content;
      } else {
        console.error(
          "No content returned from model:",
          JSON.stringify(result.output, null, 2)
        );
        throw new Error("Model returned no Dockerfile content.");
      }
    } else {
      console.error("Execution failed:\n", JSON.stringify(result, null, 2));
      throw new Error(result.error || "Failed to generate Dockerfile");
    }
  } catch (error) {
    console.error("Error in generateDockerfileFromRepo:", error);
    throw error;
  } finally {
    if (clonePath) {
      try {
        await fs.promises.rm(clonePath, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error("Failed to clean up repository:", cleanupError);
      }
    }
  }
}

module.exports = { generateDockerfileFromRepo };
