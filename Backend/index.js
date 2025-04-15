const express = require("express");
const { exec } = require("child_process");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = 5000;
app.use(cors());
app.use(bodyParser.json());

const WORKDIR = path.join(__dirname, "repos");
if (!fs.existsSync(WORKDIR)) fs.mkdirSync(WORKDIR);

app.post("/run", async (req, res) => {
  const { repoUrl, config } = req.body;
  const id = uuidv4();
  console.log(repoUrl);
  const tempPath = path.join(WORKDIR, id);
  const localPort = 4000 + Math.floor(Math.random() * 1000);
  const internalPort = config.port || 3000;
  console.log(internalPort);
  console.log(tempPath);
  // Step 1: Clone repo
  exec(`git clone ${repoUrl} ${tempPath}`, (err) => {
    if (err) return res.status(500).json({ error: "Git clone failed" });

    // Step 2: Create Dockerfile if missing
    if (!fs.existsSync(path.join(tempPath, "Dockerfile"))) {
      fs.writeFileSync(
        path.join(tempPath, "Dockerfile"),
        `
FROM node:18
WORKDIR /app
COPY . .
WORKDIR /app/backend
RUN npm install
EXPOSE 3000
CMD ["node", "backend/index.js"]


      `.trim()
      );
    }

    // Step 3: Add .env
    if (config.env) {
      const envContent = Object.entries(config.env)
        .map(([k, v]) => `${k}=${v}`)
        .join("\\n");
      fs.writeFileSync(path.join(tempPath, ".env"), envContent);
    }

    // Step 4: Build Docker image
    const imageName = `image-${id}`;
    console.log(imageName);
    exec(`docker build -t ${imageName} ${tempPath}`, (err, stdout, stderr) => {
      if (err) {
        console.error("Docker Build Error:", err);
        console.error("STDERR:", stderr);
        console.log("STDOUT:", stdout);
        return res.status(500).json({ error: "Build failed", details: stderr });
      }

      // Step 5: Run Docker container
      console.log("hi");
      const containerName = `container-${id}`;
      console.log(containerName);
      const runCmd = `docker run -d -p ${localPort}:${internalPort} --name ${containerName} ${imageName}`;
      exec(runCmd, (err) => {
        if (err) return res.status(500).json({ error: "Run failed" });

        return res.json({
          id,
          previewUrl: `https://yourdomain.com/preview/${id}`,
          localPort,
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
