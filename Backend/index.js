// index.js
const express = require("express");
const { exec, spawn } = require("child_process");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const { generateDockerfileFromRepo } = require("./dockerGen");
// const { fixDockerErrorWithAI } = require("./dockerFixer");
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

  let responded = false; // ✅ Prevent double response

  console.log("Cloning repo:", repoUrl);

  exec(`git clone ${repoUrl} ${tempPath}`, async (err) => {
    if (err) return res.status(500).json({ error: "Git clone failed" });

    try {
      const dockerfilePath = path.join(tempPath, "Dockerfile");

      // Step 1: Generate Dockerfile if it doesn't exist
      if (!fs.existsSync(dockerfilePath)) {
        console.log("No Dockerfile found. Generating with AI...");

        const dockerfileContent = await generateDockerfileFromRepo(repoUrl);
        const dockerfileMatch = dockerfileContent.match(
          /```(?:dockerfile)?\n([\s\S]*?)```/i
        );
        const cleanDockerfile = dockerfileMatch
          ? dockerfileMatch[1].trim()
          : dockerfileContent.trim();
        fs.writeFileSync(dockerfilePath, cleanDockerfile);
        console.log("📝 Generated Dockerfile:\n", cleanDockerfile);
      }

      // Step 2: Create .env file if provided
      if (config.env) {
        const envContent = Object.entries(config.env)
          .map(([k, v]) => `${k}=${v}`)
          .join("\n");
        fs.writeFileSync(path.join(tempPath, ".env"), envContent);
      }

      // Step 3: Build Docker image
      const imageName = `image-${id}`;
      console.log("🔧 Building Docker image...");
      exec(
        `docker build -t ${imageName} ${tempPath}`,
        async (err, stdout, stderr) => {
          if (err) {
            console.error("❌ Docker Build Error:", stderr);
            // const originalDockerfile = fs.readFileSync(dockerfilePath, "utf8");

            //   try {
            //     const fixedDockerfile = await fixDockerErrorWithAI(
            //       originalDockerfile,
            //       stderr
            //     );
            //     fs.writeFileSync(dockerfilePath, fixedDockerfile);
            //     console.log("🛠 Dockerfile fixed. Retrying build...");

            //     exec(
            //       `docker build -t ${imageName} ${tempPath}`,
            //       (err2, stdout2, stderr2) => {
            //         if (err2) {
            //           if (!responded) {
            //             responded = true;
            //             return res.status(500).json({
            //               error: "AI fix failed. Still can't build image.",
            //               originalError: stderr,
            //               aiFixError: stderr2,
            //             });
            //           }
            //         }
            //         runContainer();
            //       }
            //     );
            //   } catch (fixErr) {
            //     if (!responded) {
            //       responded = true;
            //       return res.status(500).json({
            //         error: "Docker build failed, and AI fix failed too.",
            //         originalError: stderr,
            //         fixError: fixErr.message,
            //       });
            //     }
            //   }
            //   return;
            // }
          }
          runContainer();

          // Step 4: Run the container and monitor logs
          function runContainer(retryTag = "") {
            const containerName = `container-${id}${retryTag}`;
            const runCmd = `docker run -d -p ${localPort}:${internalPort} --name ${containerName} ${imageName}`;
            localPort = localPort + 1;
            console.log(
              `🧹 Cleaning up any previous container named ${containerName}...`
            );
            exec(`docker rm -f ${containerName}`, () => {
              console.log(`🚀 Running container: ${containerName}`);
              exec(runCmd, (err) => {
                if (err) {
                  console.error("🚨 Docker run failed:", err.message);
                  if (!responded) {
                    responded = true;
                    return res
                      .status(500)
                      .json({ error: "Run failed", logs: err.message });
                  }
                  return;
                }

                const logFilePath = path.join(LOGDIR, `${containerName}.log`);
                const logStream = fs.createWriteStream(logFilePath);
                const logProcess = spawn("docker", [
                  "logs",
                  "-f",
                  containerName,
                ]);

                logProcess.stdout.pipe(logStream);
                logProcess.stderr.pipe(logStream);

                let logBuffer = "";

                const handleLogChunk = async (chunk) => {
                  const logText = chunk.toString();
                  logBuffer += logText;

                  if (
                    logText.includes("ReferenceError") ||
                    logText.includes("is not defined") ||
                    logText.includes("Module not found") ||
                    logText.includes("Cannot find module") ||
                    logText.includes("SyntaxError") ||
                    logText.includes("Failed to compile") ||
                    logText.includes("Traceback")
                  ) {
                    console.log(
                      "❌ Runtime error detected. Sending to AI to fix..."
                    );

                    logProcess.kill();

                    try {
                      await fixSourceCodeWithAI(logBuffer, tempPath);
                      console.log(
                        "✅ AI fix complete. Rebuilding and restarting..."
                      );

                      exec(
                        `docker build -t ${imageName} ${tempPath}`,
                        (err3, stdout3, stderr3) => {
                          if (err3) {
                            if (!responded) {
                              responded = true;
                              return res.status(500).json({
                                error: "Code fixed, but Docker rebuild failed.",
                                buildError: stderr3,
                              });
                            }
                          }
                          runContainer("-retry");
                        }
                      );
                    } catch (fixErr) {
                      if (!responded) {
                        responded = true;
                        return res.status(500).json({
                          error: "AI fix failed",
                          logs: logBuffer,
                          fixError: fixErr.message,
                        });
                      }
                    }
                  }
                };

                logProcess.stdout.on("data", handleLogChunk);
                logProcess.stderr.on("data", handleLogChunk);

                console.log(
                  `✅ Container ${containerName} is running at port ${localPort}`
                );

                if (!responded) {
                  responded = true;
                  return res.json({
                    id,
                    previewUrl: `https://yourdomain.com/preview/${id}`,
                    localPort,
                  });
                }
              });
            });
          }
        }
      );
    } catch (error) {
      console.error("❌ Unhandled error during pipeline:", error);
      if (!responded) {
        return res
          .status(500)
          .json({ error: "Unhandled pipeline error", details: error.message });
      }
    }
  });
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
