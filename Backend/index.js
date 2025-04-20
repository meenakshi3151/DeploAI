const axios = require("axios");
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
const dotenv = require("dotenv");
dotenv.config();
app.get("/api/github/callback", async (req, res) => {
  const code = req.query.code;
  // console.log(process.env.CLIENT_ID,process.env.CLIENT_SECRET)
  try {
    const response = await axios.post(
      `https://github.com/login/oauth/access_token`,
      {
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        code: code,
      },
      {
        headers: {
          Accept: "application/json",
        },
      }
    );
    console.log(response.data);
    const access_token = response.data.access_token;
    // console.log(response)
    console.log(access_token);
    const response_repo = await fetch("https://api.github.com/user/repos", {
      headers: {
        Authorization: `Bearer ${access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    });

    const repos = await response_repo.json();
    console.log("Repos.....");
    console.log(repos);

    // Extract the repo URLs
    const repoUrls = repos.map((repo) => repo.html_url);
    console.log("Repo URLs:", repoUrls);

    // Send the array to frontend
    res.redirect(
      `http://localhost:5173/home?repos=${encodeURIComponent(
        JSON.stringify(repoUrls)
      )}`
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
