require("dotenv").config();

const express    = require("express");
const cors       = require("cors");
const bodyParser = require("body-parser");

const dockerRoutes = require("./routes/dockerRoutes");

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(bodyParser.json());
app.use("/", dockerRoutes);           // mount all Docker-related endpoints

app.listen(PORT, () => {
  console.log(`🚀 Backend running at http://localhost:${PORT}`);
});
