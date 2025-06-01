const path   = require("path");
const fs     = require("fs");
const util   = require("util");
const { spawn } = require("child_process");
const { v4: uuidv4 } = require("uuid");

const exec  = util.promisify(require("child_process").exec);
const ngrok = require("ngrok");

const { generateDockerfileFromRepo } = require("../services/dockerGen");
const { fixSourceCodeWithAI }        = require("../services/dockerFixer");
const { WORKDIR, LOGDIR }            = require("../config/paths");
const errorPatterns                  = require("../utils/errorPatterns");

const INTERNAL_PORT_FALLBACK = 3000;

/**
 * POST /run
 */
async function runRepo(req, res) {
  const { repoUrl, config = {} } = req.body;

  const id        = uuidv4();
  const repoPath  = path.join(WORKDIR, id);
  const localPort = 4000 + Math.floor(Math.random() * 1000);
  const internalPort = config.port || INTERNAL_PORT_FALLBACK;

  let replied = false;

  try {
    /* 1. Clone repo ------------------------------------------------------------------ */
    console.log("Cloning repo:", repoUrl);
    await exec(`git clone ${repoUrl} ${repoPath}`);

    /* 2. Dockerfile (AI-generated when absent) --------------------------------------- */
    await ensureDockerfile(repoUrl, repoPath);

    /* 3. .env file if requested ------------------------------------------------------ */
    if (config.env) writeDotEnv(config.env, repoPath);

    /* 4. Build image ----------------------------------------------------------------- */
    const imageName = `image-${id}`;
    await buildImage(imageName, repoPath, res);
    
    /* 5. Run container (with retry if AI fixes code) --------------------------------- */
    await startContainerLoop(imageName, id, repoPath, internalPort, localPort, res);
  }
  catch (err) {
    if (!replied) res.status(500).json({ error: "Unhandled pipeline error", details: err.message });
  }

  /* ---------------------------------------------------------------- private helpers */

  async function ensureDockerfile(repoUrl, repoDir) {
    const dockerfilePath = path.join(repoDir, "Dockerfile");
    if (fs.existsSync(dockerfilePath)) return;

    console.log("No Dockerfile found. Generating with AI…");
    const raw = await generateDockerfileFromRepo(repoUrl);
    const m   = raw.match(/```(?:dockerfile)?\n([\s\S]*?)```/i);
    fs.writeFileSync(dockerfilePath, (m ? m[1] : raw).trim());
  }

  function writeDotEnv(envObj, repoDir) {
    const str = Object.entries(envObj).map(([k, v]) => `${k}=${v}`).join("\n");
    fs.writeFileSync(path.join(repoDir, ".env"), str);
  }

  async function buildImage(imageName, repoDir, res) {
    console.log("🔧 Building Docker image...");
    try {
      await exec(`docker build -t ${imageName} ${repoDir}`);
    } catch (err) {
      res.status(500).json({ error: "Docker build failed", details: err.stderr });
      throw err;
    }
  }

  async function startContainerLoop(imageName, id, repoDir, internalPort, localPort, res, tag = "") {
    const container = `container-${id}${tag}`;
    await exec(`docker rm -f ${container}`).catch(() => {});

    console.log(`🚀 Running container: ${container}`);
    try {
      await exec(`docker run -d -p ${localPort}:${internalPort} --name ${container} ${imageName}`);
    } catch (err) {
      if (!replied) res.status(500).json({ error: "Run failed", logs: err.stderr });
      return;
    }

    /* 5a. Stream logs and watch for errors ------------------------------------------ */
    const logFile = path.join(LOGDIR, `${container}.log`);
    const logStream = fs.createWriteStream(logFile);
    const logProc   = spawn("docker", ["logs", "-f", container]);
    logProc.stdout.pipe(logStream);
    logProc.stderr.pipe(logStream);

    let buffer = "";
    const check = async (chunk) => {
      const text = chunk.toString();
      buffer += text;

      if (errorPatterns.test(text)) {
        console.log("❌ Runtime error detected, sending to AI fixer…");
        logProc.kill();

        try {
          await fixSourceCodeWithAI(buffer, repoDir);
          console.log("✅ AI fix complete ➜ rebuilding");
          await buildImage(imageName, repoDir, res);
          await startContainerLoop(imageName, id, repoDir, internalPort, localPort, res, "-retry");
        } catch (fixErr) {
          if (!replied) {
            replied = true;
            res.status(500).json({ error: "AI fix failed", logs: buffer, fixError: fixErr.message });
          }
        }
      }
    };
    logProc.stdout.on("data", check);
    logProc.stderr.on("data", check);

    /* 5b. Expose via ngrok ----------------------------------------------------------- */
    try {
      const publicUrl = await ngrok.connect({ addr: localPort, proto: "http" });
      if (!replied) {
        replied = true;
        res.json({ id, previewUrl: publicUrl, localPort });
      }
    } catch (ngrokErr) {
      if (!replied) {
        replied = true;
        res.status(500).json({ error: "Container started, but ngrok tunnel failed", details: ngrokErr.message });
      }
    }
  }
}

/**
 * GET /logs/:id
 */
function getLogs(req, res) {
  const { LOGDIR } = require("../config/paths");
  const file = path.join(LOGDIR, `container-${req.params.id}.log`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Log file not found" });
  res.json({ logs: fs.readFileSync(file, "utf8") });
}

module.exports = { runRepo, getLogs };
