// index.js
const express = require("express");
const { spawn } = require("child_process");
const util = require("util");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const exec = util.promisify(require("child_process").exec);
const ngrok = require("ngrok");

const { generateDockerfileFromRepo } = require("./dockerGen");
const { fixSourceCodeWithAI } = require("./dockerFixer");

const app = express();
const PORT = 5000;
app.use(cors());
app.use(bodyParser.json());

const WORKDIR = path.join(__dirname, "repos");
if (!fs.existsSync(WORKDIR)) fs.mkdirSync(WORKDIR);

const LOGDIR = path.join(__dirname, "logs");
if (!fs.existsSync(LOGDIR)) fs.mkdirSync(LOGDIR);

app.post("/run", async (req, res) => {
  const { repoUrl, config } = req.body;
  const id = uuidv4();
  const tempPath = path.join(WORKDIR, id);
  let localPort = 4000 + Math.floor(Math.random() * 1000);
  const internalPort = config.port || 3000;
  let responded = false;

  try {
    console.log("Cloning repo:", repoUrl);
    await exec(`git clone ${repoUrl} ${tempPath}`);

    const dockerfilePath = path.join(tempPath, "Dockerfile");
    if (!fs.existsSync(dockerfilePath)) {
      console.log("No Dockerfile found. Generating with AI...");
      const dockerfileContent = await generateDockerfileFromRepo(repoUrl);
      const match = dockerfileContent.match(/```(?:dockerfile)?\n([\s\S]*?)```/i);
      const cleanDockerfile = match ? match[1].trim() : dockerfileContent.trim();
      fs.writeFileSync(dockerfilePath, cleanDockerfile);
      console.log("📝 Generated Dockerfile:\n", cleanDockerfile);
    }

    if (config.env) {
      const envContent = Object.entries(config.env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\n");
      fs.writeFileSync(path.join(tempPath, ".env"), envContent);
    }

    const imageName = `image-${id}`;
    console.log("🔧 Building Docker image...");
    try {
      await exec(`docker build -t ${imageName} ${tempPath}`);
    } catch (err) {
      console.error("❌ Docker build failed:", err.stderr);
      return res.status(500).json({ error: "Docker build failed", details: err.stderr });
    }

    await runContainer("");

    async function runContainer(retryTag = "") {
      const containerName = `container-${id}${retryTag}`;
      await exec(`docker rm -f ${containerName}`).catch(() => {});
      console.log(`🚀 Running container: ${containerName}`);

      try {
        await exec(`docker run -d -p ${localPort}:${internalPort} --name ${containerName} ${imageName}`);
      } catch (err) {
        console.error("🚨 Docker run failed:", err.stderr);
        if (!responded) {
          responded = true;
          return res.status(500).json({ error: "Run failed", logs: err.stderr });
        }
        return;
      }

      const logFilePath = path.join(LOGDIR, `${containerName}.log`);
      const logStream = fs.createWriteStream(logFilePath);
      const logProcess = spawn("docker", ["logs", "-f", containerName]);
      logProcess.stdout.pipe(logStream);
      logProcess.stderr.pipe(logStream);

      let logBuffer = "";
      const handleLogChunk = async (chunk) => {
        const text = chunk.toString();
        logBuffer += text;

        if (
          text.includes("ReferenceError") ||
          text.includes("is not defined") ||
          text.includes("Module not found") ||
          text.includes("Cannot find module") ||
          text.includes("SyntaxError") ||
          text.includes("Failed to compile") ||
          text.includes("Traceback")
        ) {
          console.log("❌ Runtime error detected. Sending to AI to fix...");
          logProcess.kill();

          try {
            await fixSourceCodeWithAI(logBuffer, tempPath);
            console.log("✅ AI fix complete. Rebuilding and restarting...");
            await exec(`docker build -t ${imageName} ${tempPath}`);
            await runContainer("-retry");
          } catch (err) {
            if (!responded) {
              responded = true;
              return res.status(500).json({
                error: "AI fix failed",
                logs: logBuffer,
                fixError: err.message,
              });
            }
          }
        }
      };

      logProcess.stdout.on("data", handleLogChunk);
      logProcess.stderr.on("data", handleLogChunk);

      console.log(`✅ Container ${containerName} is running on port ${localPort}`);
      try {
        const publicUrl = await ngrok.connect({ addr: localPort, proto: "http" });
        console.log(`🌍 Public URL: ${publicUrl}`);

        if (!responded) {
          responded = true;
          return res.json({ id, previewUrl: publicUrl, localPort });
        }
      } catch (ngrokError) {
        console.error("❌ ngrok failed:", ngrokError.message);
        if (!responded) {
          responded = true;
          return res.status(500).json({
            error: "Container started, but ngrok tunnel failed",
            details: ngrokError.message,
          });
        }
      }
    }
  } catch (err) {
    console.error("❌ Unhandled pipeline error:", err.message);
    if (!responded) {
      return res.status(500).json({ error: "Unhandled pipeline error", details: err.message });
    }
  }
});

app.get("/logs/:id", (req, res) => {
  const containerName = `container-${req.params.id}`;
  const logFilePath = path.join(LOGDIR, `${containerName}.log`);
  if (!fs.existsSync(logFilePath)) {
    return res.status(404).json({ error: "Log file not found" });
  }
  const logs = fs.readFileSync(logFilePath, "utf8");
  res.json({ logs });
});

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
